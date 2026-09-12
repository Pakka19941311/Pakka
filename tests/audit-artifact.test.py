"""Small corruption/missing-reference and source-mutation controls; no engine."""
from pathlib import Path
import hashlib,importlib.util,json,struct,tempfile,unittest

ROOT=Path(__file__).resolve().parents[1]
def module(name,path):
 spec=importlib.util.spec_from_file_location(name,ROOT/path);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
pck=module('audit_pck','scripts/audit-pck.py');gdc=module('audit_gdc','scripts/audit-gdc-source.py')

def fixture(path,files):
 # Tiny embedded v3 container, exercising absolute placement and footer bounds.
 body=bytearray();entries=[]
 for name,data in files.items():
  entries.append((name,len(body),data));body.extend(data)
 directory=112+len(body);table=bytearray(struct.pack('<I',len(entries)))
 for name,offset,data in entries:
  encoded=name.encode()+b'\0';table.extend(struct.pack('<I',len(encoded)));table.extend(encoded)
  table.extend(struct.pack('<QQ',offset,len(data)));table.extend(hashlib.md5(data).digest());table.extend(struct.pack('<I',0))
 header=struct.pack('<4s5IQQ',b'GDPC',3,4,6,3,0,112,directory).ljust(112,b'\0')
 pack=header+body+table;path.write_bytes(b'MZ-test-prefix'+pack+struct.pack('<Q4s',len(pack),b'GDPC'))

class ArtifactChecks(unittest.TestCase):
 def test_embedded_checksums_and_remap_require_real_target(self):
  with tempfile.TemporaryDirectory() as tmp:
   path=Path(tmp)/'sample.exe';fixture(path,{'a.gd.remap':b'[remap]\npath="res://a.gdc"\n','a.gdc':b'actual tokens'})
   value=pck.Pck(path)
   self.assertTrue(pck.available(value,'a.gd'));self.assertEqual(value.hash('a.gdc'),value.entries['a.gdc']['md5']);value.close()
   fixture(path,{'a.gd.remap':b'[remap]\npath="res://missing.gdc"\n'})
   value=pck.Pck(path);self.assertFalse(pck.available(value,'a.gd'));value.close()
 def test_corruption_detected_and_truncated_footer_rejected(self):
  with tempfile.TemporaryDirectory() as tmp:
   path=Path(tmp)/'sample.exe';fixture(path,{'a':b'original'})
   value=pck.Pck(path);offset=value.entries['a']['at'];value.close()
   with path.open('r+b') as f:f.seek(offset);f.write(b'X')
   value=pck.Pck(path);self.assertNotEqual(value.hash('a'),value.entries['a']['md5']);value.close()
   path.write_bytes(path.read_bytes()[:-3])
   with self.assertRaises((ValueError,struct.error)):pck.Pck(path)
 def test_lexer_keeps_numeric_changes_and_indentation(self):
  source='func run():\n\tvar value = -1\n\treturn value+2\n'
  original,columns=gdc.lex(source);changed,new_columns=gdc.lex(source.replace('value+2','value+3'))
  self.assertNotEqual(original,changed);self.assertEqual(columns,new_columns)
  same,shifted=gdc.lex(source.replace('\treturn','\t\treturn'))
  self.assertEqual(original,same);self.assertNotEqual(columns,shifted)
  self.assertIn(['LITERAL',(2,-1),2],original)

if __name__=='__main__':unittest.main()
