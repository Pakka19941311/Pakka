"""Build and inspect the P0 Android sample; never install or read personal data.

Requires Godot 4.6.3 with matching Android templates, JDK 17, Android SDK
Build-Tools 36.0.0, Platform 36 and Platform-Tools. Uses a fresh project and private debug key.
An APK inspection is not a device installation, render or networking test.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import subprocess
import tempfile
import zipfile


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--godot', required=True)
    parser.add_argument('--jdk', required=True)
    parser.add_argument('--sdk', required=True)
    parser.add_argument('--evidence', required=True)
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    source = root / 'docs/migration/p0/toolchain-sample/godot'
    evidence = Path(args.evidence).resolve()
    evidence.mkdir(parents=True, exist_ok=False)
    work = Path(tempfile.mkdtemp(prefix='varendor-p0-android-'))
    project = work / 'project'
    project.mkdir()
    names = ['project.godot', 'export_presets.cfg', 'sample.gd',
             'sample.gd.uid', 'sample.tscn', 'p0-crate.glb']
    for name in names:
        shutil.copy2(source / name, project / name)
    sdk, jdk = Path(args.sdk).resolve(), Path(args.jdk).resolve()
    build_tools = sdk / 'build-tools/36.0.0'
    config = work / 'config/godot'
    config.mkdir(parents=True)
    settings = ('[gd_resource type="EditorSettings" format=3]\n\n[resource]\n'
                f'export/android/java_sdk_path = {json.dumps(str(jdk))}\n'
                f'export/android/android_sdk_path = {json.dumps(str(sdk))}\n')
    (config / 'editor_settings-4.6.tres').write_text(settings)
    env = os.environ.copy()
    env.update(JAVA_HOME=str(jdk), ANDROID_HOME=str(sdk),
               XDG_CONFIG_HOME=str(work / 'config'))
    env['PATH'] = str(jdk / 'bin') + os.pathsep + env['PATH']
    password = secrets.token_urlsafe(32)
    key = work / 'p0-debug.keystore'
    env.update(GODOT_ANDROID_KEYSTORE_DEBUG_PATH=str(key),
               GODOT_ANDROID_KEYSTORE_DEBUG_USER='p0debug',
               GODOT_ANDROID_KEYSTORE_DEBUG_PASSWORD=password,
               VARENDOR_P0_KEY_PASSWORD=password)
    report = {'source_commit': subprocess.check_output(
        ['git', 'rev-parse', 'HEAD'], cwd=root, text=True).strip(),
        'source_files_sha256': {n: hashlib.sha256((source/n).read_bytes()).hexdigest()
                               for n in names},
        'scope': 'P0 technical sample APK only; no game client migration',
        'personal_data_accessed': False, 'p1_started': False,
        'device_installation': 'not_attempted', 'device_render': 'not_measured',
        'network_runtime': 'not_tested', 'checks': {}}
    checks = report['checks']

    def run(label, command, required=True, timeout=120):
        result = subprocess.run(command, env=env, capture_output=True,
                                text=True, timeout=timeout)
        output = (result.stdout + result.stderr).replace(password, '<redacted>')
        (evidence / (label + '.log.txt')).write_text(output)
        if required and result.returncode != 0:
            raise RuntimeError(f'{label}: exit {result.returncode}; see evidence')
        return result.returncode, output

    try:
        _, version = run('godot-version', [args.godot, '--version'])
        assert version.strip().startswith('4.6.3.stable.'), version
        report['godot_version'] = version.strip()
        _, java = run('java-version', [str(jdk/'bin/java'), '-version'])
        _, javac = run('javac-version', [str(jdk/'bin/javac'), '--version'])
        report['java_version'], report['javac_version'] = java.strip(), javac.strip()
        assert javac.strip().startswith('javac 17.'), javac
        java_source = work / 'P0JdkProbe.java'
        java_source.write_text('public class P0JdkProbe { public static void main(String[] args) { System.out.println("P0_JDK_PASS"); } }\n')
        run('jdk-compile', [str(jdk/'bin/javac'), str(java_source)])
        _, java_result = run('jdk-run', [str(jdk/'bin/java'), '-cp', str(work), 'P0JdkProbe'])
        assert java_result.strip() == 'P0_JDK_PASS'
        checks['jdk_compile_and_run'] = True
        run('adb-version', [str(sdk/'platform-tools/adb'), 'version'])
        run('signer-version', [str(build_tools/'apksigner'), 'version'])
        checks['tool_versions_available'] = True
        run('debug-key', [str(jdk/'bin/keytool'), '-genkeypair', '-noprompt',
            '-keystore', str(key), '-storepass:env', 'VARENDOR_P0_KEY_PASSWORD',
            '-keypass:env', 'VARENDOR_P0_KEY_PASSWORD', '-alias', 'p0debug',
            '-dname', 'CN=Varendor P0 Temporary Debug', '-keyalg', 'RSA',
            '-keysize', '2048', '-validity', '30'])
        key.chmod(0o600)
        run('android-import', [args.godot, '--headless', '--editor',
            '--path', str(project), '--import'])
        apk = work / 'varendor-p0-toolchain.apk'
        run('android-export', [args.godot, '--headless', '--path', str(project),
            '--export-debug', 'P0 Android', str(apk)], timeout=180)
        checks['clean_android_export'] = apk.is_file()
        with zipfile.ZipFile(apk) as archive:
            assert archive.testzip() is None
            files = archive.namelist()
            abis = sorted({n.split('/')[1] for n in files if n.startswith('lib/')})
            assert abis == ['arm64-v8a'], abis
            assert 'assets/project.binary' in files
            assert any(n.startswith('assets/') and 'p0-crate' in n for n in files)
            report['apk_asset_files'] = [n for n in files if n.startswith('assets/')]
        checks.update(apk_zip_crc=True, arm64_only=True, project_resources_present=True)
        _, signature = run('apk-signature', [str(build_tools/'apksigner'),
            'verify', '--verbose', '--print-certs', str(apk)])
        assert 'Verified using v2 scheme (APK Signature Scheme v2): true' in signature
        checks['apk_v2_signature_verified'] = True
        run('apk-alignment', [str(build_tools/'zipalign'), '-c', '-P', '16', '4', str(apk)])
        checks['apk_alignment_16k'] = True
        _, permissions = run('apk-permissions', [str(build_tools/'aapt'),
            'dump', 'permissions', str(apk)])
        assert "uses-permission: name='android.permission.INTERNET'" in permissions
        checks['internet_manifest_permission'] = True
        _, badging = run('apk-badging', [str(build_tools/'aapt'), 'dump', 'badging', str(apk)])
        assert "name='org.varendor.p0toolchain'" in badging
        checks['isolated_package_identity'] = True
        report.update(apk_bytes=apk.stat().st_size,
            apk_sha256=hashlib.file_digest(apk.open('rb'), 'sha256').hexdigest(),
            apk_abis=abis, certificate_sha256=re.search(
                r'certificate SHA-256 digest: (\w+)', signature).group(1),
            sdk_properties={str(p.relative_to(sdk)): p.read_text() for p in [
                sdk/'platform-tools/source.properties',
                build_tools/'source.properties', sdk/'platforms/android-36/source.properties']})
        status, devices = run('adb-devices', [str(sdk/'platform-tools/adb'),
            'devices', '-l'], required=False, timeout=30)
        report['adb_device_enumeration'] = {'exit_code': status, 'output': devices}
        report['status'] = 'passed_with_limitations'
        print(json.dumps({'status': report['status'], 'checks': checks,
                          'apk_path': str(apk), 'evidence': str(evidence)}, indent=2))
    except Exception as error:
        report.update(status='failed', error=str(error))
        raise
    finally:
        # The throwaway key signs only this isolated debug package, never a release.
        key.unlink(missing_ok=True)
        report['temporary_key_removed'] = not key.exists()
        (evidence/'android-probe.json').write_text(json.dumps(report, indent=2)+'\n')


if __name__ == '__main__':
    main()
