#!/usr/bin/env python3
"""Gera apps-script/DeliciasDaJac.gs (arquivo único, para colar no editor do Apps Script)
juntando apps-script/src/*.gs em ordem alfabética (00_, 10_, ...).

  python scripts/build_apps_script.py          # gera o arquivo
  python scripts/build_apps_script.py --check  # só confere se está em dia (sai com código 1 se não)
"""
import glob, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'apps-script', 'src')
OUT = os.path.join(ROOT, 'apps-script', 'DeliciasDaJac.gs')


def build():
    parts = ['/** Delícias da Jac — Sistema de encomendas · arquivo único GERADO por scripts/build_apps_script.py.\n'
             ' *  NÃO edite aqui: edite apps-script/src/*.gs e gere de novo. */\n']
    for f in sorted(glob.glob(os.path.join(SRC, '*.gs'))):
        parts.append('\n// ===== %s =====\n' % os.path.basename(f))
        parts.append(open(f, encoding='utf-8').read())
    return ''.join(parts)


if __name__ == '__main__':
    text = build()
    if '--check' in sys.argv:
        cur = open(OUT, encoding='utf-8').read() if os.path.exists(OUT) else ''
        if cur != text:
            print('apps-script/DeliciasDaJac.gs está desatualizado. Rode: python scripts/build_apps_script.py')
            sys.exit(1)
        print('apps-script/DeliciasDaJac.gs está em dia.')
    else:
        open(OUT, 'w', encoding='utf-8', newline='\n').write(text)
        print('Gerado %s (%d bytes)' % (os.path.relpath(OUT, ROOT), len(text.encode('utf-8'))))
