import sys; sys.argv = ["x"]
import importlib.util, time
spec = importlib.util.spec_from_file_location("fno", "fno_oi.py"); src = open("fno_oi.py").read().replace("\nmain()\n", "\n")
ns = {}; exec(compile(src, "fno_oi", "exec"), ns)
out = []
for s in ["RELIANCE", "BEL", "SBIN", "TCS", "HDFCBANK", "INFY", "ITC", "LT"]:
    t = time.time(); r = ns["one"](s); out.append(f"{s}: {'OK ' + str(r[1]['callWall']) if r[1] else 'NONE'} {time.time() - t:.1f}s")
out.append(str(ns["ERR"]))
open("/tmp/research.md", "w").write("\n".join(out)); print("\n".join(out))
