"""Check access to gated Hugging Face datasets with the HF_TOKEN secret, and show how a few files begin,
so a counter can be written for them. Run in Actions: gh workflow run hf-probe.yml -f paths="ds:path ..."
Each argument is DATASET:PATH (a file), DATASET: (its file list) or ORG/* (its datasets)."""
import json
import os
import sys
import urllib.request

HF = "https://huggingface.co"
token = os.environ.get("HF_TOKEN")
print("token set:", bool(token))
for arg in sys.argv[1:]:
    ds, _, path = arg.partition(":")
    if ds.endswith("/*"):  # every dataset an organisation publishes
        req = urllib.request.Request(f"{HF}/api/datasets?author={ds[:-2]}&limit=200", headers={"Authorization": f"Bearer {token}"} if token else {})
        with urllib.request.urlopen(req, timeout=120) as r:
            print(f"===== {arg}\n" + "\n".join(x["id"] + (" gated" if x.get("gated") else "") for x in json.load(r)))
        continue
    url = f"{HF}/api/datasets/{ds}/tree/main?recursive=1" if not path else f"{HF}/datasets/{ds}/resolve/main/{path}"
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}", "Range": "bytes=0-3000"} if token else {"Range": "bytes=0-3000"})
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            body = r.read(200000 if not path else 3000)
        print(f"===== {arg} OK")
        if not path:
            items = json.loads(body) if body.strip().startswith(b"[") else []
            print("\n".join(f"{x['path']} {x.get('size', '')}" for x in items[:80] if x["type"] == "file"))
        else:
            print(body.decode("utf-8", "replace"))
    except Exception as e:  # noqa: BLE001
        print(f"===== {arg} FAILED: {e}")
