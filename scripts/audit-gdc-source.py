"""Compare a bounded GDScript text subset with Godot 4.6 tokenizer-101 bytes.

Reads no saves and runs no engine. Unsupported literals/syntax fail explicitly.
Protocol: Godot 4.6-stable modules/gdscript/gdscript_tokenizer{,_buffer}.{h,cpp}.
"""
import argparse,ast,hashlib,importlib.util,io,json,struct,subprocess,tokenize
from pathlib import Path

TOKEN_NAMES='''EMPTY ANNOTATION IDENTIFIER LITERAL LESS LESS_EQUAL GREATER GREATER_EQUAL EQUAL_EQUAL BANG_EQUAL AND OR NOT AMPERSAND_AMPERSAND PIPE_PIPE BANG AMPERSAND PIPE TILDE CARET LESS_LESS GREATER_GREATER PLUS MINUS STAR STAR_STAR SLASH PERCENT EQUAL PLUS_EQUAL MINUS_EQUAL STAR_EQUAL STAR_STAR_EQUAL SLASH_EQUAL PERCENT_EQUAL LESS_LESS_EQUAL GREATER_GREATER_EQUAL AMPERSAND_EQUAL PIPE_EQUAL CARET_EQUAL IF ELIF ELSE FOR WHILE BREAK CONTINUE PASS RETURN MATCH WHEN AS ASSERT AWAIT BREAKPOINT CLASS CLASS_NAME TK_CONST ENUM EXTENDS FUNC TK_IN IS NAMESPACE PRELOAD SELF SIGNAL STATIC SUPER TRAIT VAR TK_VOID YIELD BRACKET_OPEN BRACKET_CLOSE BRACE_OPEN BRACE_CLOSE PARENTHESIS_OPEN PARENTHESIS_CLOSE COMMA SEMICOLON PERIOD PERIOD_PERIOD PERIOD_PERIOD_PERIOD COLON DOLLAR FORWARD_ARROW UNDERSCORE NEWLINE INDENT DEDENT CONST_PI CONST_TAU CONST_INF CONST_NAN VCS_CONFLICT_MARKER BACKTICK QUESTION_MARK ERROR TK_EOF TK_MAX'''.split()
OPS=dict(zip('LESS LESS_EQUAL GREATER GREATER_EQUAL EQUAL_EQUAL BANG_EQUAL AMPERSAND_AMPERSAND PIPE_PIPE BANG AMPERSAND PIPE TILDE CARET LESS_LESS GREATER_GREATER PLUS MINUS STAR STAR_STAR SLASH PERCENT EQUAL PLUS_EQUAL MINUS_EQUAL STAR_EQUAL STAR_STAR_EQUAL SLASH_EQUAL PERCENT_EQUAL LESS_LESS_EQUAL GREATER_GREATER_EQUAL AMPERSAND_EQUAL PIPE_EQUAL CARET_EQUAL BRACKET_OPEN BRACKET_CLOSE BRACE_OPEN BRACE_CLOSE PARENTHESIS_OPEN PARENTHESIS_CLOSE COMMA SEMICOLON PERIOD PERIOD_PERIOD PERIOD_PERIOD_PERIOD COLON DOLLAR FORWARD_ARROW UNDERSCORE BACKTICK QUESTION_MARK'.split(),'< <= > >= == != && || ! & | ~ ^ << >> + - * ** / % = += -= *= **= /= %= <<= >>= &= |= ^= [ ] { } ( ) , ; . .. ... : $ -> _ ` ?'.split()))
KEYWORDS={name.lower().removeprefix('tk_'):name for name in TOKEN_NAMES[TOKEN_NAMES.index('IF'):TOKEN_NAMES.index('BRACKET_OPEN')]}
KEYWORDS.update({'and':'AND','or':'OR','not':'NOT','PI':'CONST_PI','TAU':'CONST_TAU','INF':'CONST_INF','NAN':'CONST_NAN'})

def decode(data,node):
 if data[:4]!=b'GDSC' or struct.unpack_from('<I',data,4)[0]!=101:raise ValueError('unsupported GDC tokenizer version')
 size=struct.unpack_from('<I',data,8)[0]
 if size:
  code="const z=require('node:zlib');let b=[];process.stdin.on('data',x=>b.push(x));process.stdin.on('end',()=>process.stdout.write(z.zstdDecompressSync(Buffer.concat(b))));"
  b=subprocess.check_output([node,'-e',code],input=data[12:])
  if len(b)!=size:raise ValueError('invalid decompressed GDC size')
 else:b=data[12:]
 ids_count,const_count,line_count,token_count=struct.unpack_from('<4I',b);at=16;ids=[];constants=[]
 for _ in range(ids_count):
  n=struct.unpack_from('<I',b,at)[0];at+=4;ids.append(bytes(v^0xb6 for v in b[at:at+n*4]).decode('utf-32le'));at+=n*4
 for _ in range(const_count):
  kind=struct.unpack_from('<I',b,at)[0];at+=4;wide=bool(kind&65536);kind&=65535
  if kind==0:value=None
  elif kind==1:value=bool(struct.unpack_from('<I',b,at)[0]);at+=4
  elif kind==2:value=struct.unpack_from('<q' if wide else '<i',b,at)[0];at+=8 if wide else 4
  elif kind==3:value=struct.unpack_from('<d' if wide else '<f',b,at)[0];at+=8 if wide else 4
  elif kind==4:
   n=struct.unpack_from('<I',b,at)[0];at+=4;value=b[at:at+n].decode('utf8');at+=(n+3)//4*4
  else:raise ValueError('unsupported GDC literal variant '+str(kind))
  constants.append((kind,value))
 lines={};columns={}
 for target in [lines,columns]:
  for _ in range(line_count):
   index,value=struct.unpack_from('<II',b,at);at+=8;target[index]=value
 tokens=[]
 for _ in range(token_count):
  token_type=struct.unpack_from('<I',b,at)[0] if b[at]&0x80 else b[at];at+=4 if b[at]&0x80 else 1
  line=struct.unpack_from('<I',b,at)[0];at+=4;name=TOKEN_NAMES[token_type&127]
  value=ids[token_type>>8] if name in ['IDENTIFIER','ANNOTATION'] else constants[token_type>>8] if name=='LITERAL' else name
  tokens.append([name,value,line])
 if at!=len(b):raise ValueError('GDC trailing/unparsed bytes')
 return tokens,lines,columns

def lex(source):
 tokens=[];columns=[];source_lines=source.splitlines()
 for item in tokenize.generate_tokens(io.StringIO(source).readline):
  if item.type in [tokenize.NL,tokenize.NEWLINE,tokenize.INDENT,tokenize.DEDENT,tokenize.COMMENT,tokenize.ENDMARKER]:continue
  text=item.string;line,col=item.start
  if item.type==tokenize.NAME:
   if text in ['true','false','null']:name='LITERAL';value=(0,None) if text=='null' else (1,text=='true')
   else:name=KEYWORDS.get(text,'IDENTIFIER');value=text if name=='IDENTIFIER' else name
  elif item.type==tokenize.NUMBER:
   value=ast.literal_eval(text);name='LITERAL';value=(3 if isinstance(value,float) else 2,value)
  elif item.type==tokenize.STRING:name='LITERAL';value=(4,ast.literal_eval(text))
  elif item.type==tokenize.OP:
   name=next((key for key,value in OPS.items() if value==text),None)
   if name is None:raise ValueError('unsupported source operator '+text)
   value=name
  else:raise ValueError('unsupported source token '+repr(text))
  tokens.append([name,value,line]);columns.append(len(source_lines[line-1][:col].expandtabs(4))+1)
 # Godot folds an adjacent unary sign into a numeric literal. It retains a
 # binary subtraction token after an expression-ending identifier/value/close.
 folded=[];folded_columns=[];index=0
 expression_ends={'IDENTIFIER','LITERAL','PARENTHESIS_CLOSE','BRACKET_CLOSE','BRACE_CLOSE','SELF','CONST_PI','CONST_TAU','CONST_INF','CONST_NAN'}
 while index<len(tokens):
  item=tokens[index]
  if item[0] in ['MINUS','PLUS'] and index+1<len(tokens) and tokens[index+1][0]=='LITERAL' and tokens[index+1][1][0] in [2,3] and (not folded or folded[-1][0] not in expression_ends):
   following=tokens[index+1];folded.append(['LITERAL',(following[1][0],following[1][1]*(-1 if item[0]=='MINUS' else 1)),item[2]]);folded_columns.append(columns[index]);index+=2
  else:folded.append(item);folded_columns.append(columns[index]);index+=1
 return folded,folded_columns

def compare(data,source,node):
 actual,lines,columns=decode(data,node);expected,source_columns=lex(source)
 mismatches=[{'token':i,'expected':expected[i] if i<len(expected) else None,'actual':actual[i] if i<len(actual) else None}
  for i in range(max(len(actual),len(expected))) if i>=len(actual) or i>=len(expected) or actual[i]!=expected[i]]
 positions=[index for index,column in columns.items() if index>=len(expected) or source_columns[index]!=column or expected[index][2]!=lines[index]]
 return {'status':'PASS' if not mismatches and not positions else 'FAIL','compiledTokens':len(actual),'sourceTokens':len(expected),
  'tokenMismatches':mismatches[:10],'lineColumnMismatches':positions,'lineColumnEntries':len(lines),
  'comparison':'All identifiers, typed scalar constants, keywords, operators, token source lines and recorded indentation columns; comments/whitespace omitted by Godot compilation.'}

if __name__=='__main__':
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--exe',type=Path,required=True);parser.add_argument('--source',type=Path,required=True)
 parser.add_argument('--resource',required=True);parser.add_argument('--node',default='node');parser.add_argument('--output',type=Path,required=True);args=parser.parse_args()
 spec=importlib.util.spec_from_file_location('audit_pck',Path(__file__).with_name('audit-pck.py'));module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
 pck=module.Pck(args.exe);data=pck.read(args.resource.removeprefix('res://').removesuffix('.gd')+'.gdc');pck.close();source=args.source.read_text(encoding='utf8')
 report=compare(data,source,args.node);report.update(resource=args.resource,compiledSha256=hashlib.sha256(data).hexdigest(),sourceSha256LF=hashlib.sha256(source.encode()).hexdigest(),protocolSource='https://github.com/godotengine/godot/blob/4.6-stable/modules/gdscript/gdscript_tokenizer_buffer.cpp')
 if args.output.exists():raise SystemExit('Refusing to overwrite existing evidence')
 args.output.parent.mkdir(parents=True,exist_ok=True);args.output.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf8');print(json.dumps(report,ensure_ascii=True))
 raise SystemExit(0 if report['status']=='PASS' else 2)
