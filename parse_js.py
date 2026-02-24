import esprima, sys

path = sys.argv[1]
text = open(path, 'r', encoding='utf-8').read()
try:
    esprima.parseScript(text, tolerant=True)
    print('Parsed successfully')
except Exception as e:
    print('Parse error', e)