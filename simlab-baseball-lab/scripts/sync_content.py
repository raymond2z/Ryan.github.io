from pathlib import Path
import json
root = Path(__file__).resolve().parents[1]
g = json.loads((root / "content.json").read_text())
(root / "content.js").write_text("window.GUIDE=" + json.dumps(g, ensure_ascii=False) + ";\n")
