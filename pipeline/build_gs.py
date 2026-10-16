#!/usr/bin/env python3
"""Assemble apps-script/Code.gs (the single file pasted/deployed into Apps Script) from its three parts:
   apps-script/Code.base.gs   web-app endpoints (ping, dash, nse, wl_*, calls_* routes …)
   calls_engine.js            the pure-JS calls engine (JCE) — identical file the terminal loads
   apps-script/Calls.server.gs  call book (08:10 build, 16:05 reconcile, Drive JC_Calls.json, triggers)
Run from the repo root:  python3 pipeline/build_gs.py"""
import pathlib
r = pathlib.Path(__file__).resolve().parent.parent
base = (r / 'apps-script/Code.base.gs').read_text()
eng = (r / 'calls_engine.js').read_text()
srv = (r / 'apps-script/Calls.server.gs').read_text()
tg = (r / 'apps-script/Telegram.server.gs').read_text()
out = base.rstrip() + '\n\n/* ===================== calls_engine.js (JCE) — generated, do not edit here ===================== */\n' + eng.rstrip() + '\n\n' + srv.lstrip() + '\n\n' + tg.lstrip()
(r / 'apps-script/Code.gs').write_text(out)
print('Code.gs', len(out.encode()), 'bytes')
