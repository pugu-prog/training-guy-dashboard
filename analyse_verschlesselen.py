"""Verschlësselt d'Analyse-Donnéeën (FIT-Sessiounen + Jotform) fir den Tab "Analyse".

D'Donnéeën kommen aus dem privaten Repo (bericht.py → bericht/sessions-Guy.json + jotform-Guy.json).
Publizéiert gëtt nëmmen data/analyse.enc.json (AES-256-GCM, Schlëssel aus dem Passwuert iwwer
PBKDF2-SHA256). Am Browser entschlësselt analyse.js mat WebCrypto.

  python3 analyse_verschlesselen.py [--bericht ~/Claude/Apps/training-fit-cloud/bericht]

D'Passwuert gëtt agetippt (Mac-Fënster) oder kënnt aus ANALYSE_PASSWUERT (GitHub-Secret am Repo training-fit). Ni committen.
Geet déi bestoend Datei net mam Passwuert op, brécht d'Script of (ausser mat --nei-passwuert).
"""
import base64, datetime, getpass, json, os, subprocess, sys

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

ROOT = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(ROOT, "data", "analyse.enc.json")
ITER = 600_000


def b64(b):
    return base64.b64encode(b).decode()


def prompt(text):
    """Op dem Mac eng Fënster mat Punkten (een gesäit, wéi vill ee getippt huet), soss getpass."""
    if sys.platform == "darwin":
        script = f'text returned of (display dialog "{text}" default answer "" with hidden answer with title "Analyse verschlësselen")'
        r = subprocess.run(["osascript", "-e", script], capture_output=True, text=True)
        if r.returncode != 0:
            sys.exit("Ofgebrach.")
        return r.stdout.rstrip("\n")
    return getpass.getpass(text + " ")


def ask():
    msg = "Passwuert fir d'Analyse (mindestens 10 Zeechen):"
    while True:
        pw = prompt(msg)
        if len(pw) < 10:
            msg = "Ze kuerz. Passwuert (mindestens 10 Zeechen):"
            continue
        if pw == prompt("Datselwecht Passwuert nach eng Kéier:"):
            return pw
        msg = "Net d'selwecht. Nach eng Kéier vu vir: Passwuert:"


def main():
    a = sys.argv[1:]
    src = os.path.expanduser(a[a.index("--bericht") + 1] if "--bericht" in a else "~/Claude/Apps/training-fit-cloud/bericht")
    sessions = json.load(open(os.path.join(src, "sessions-Guy.json")))
    jotform = json.load(open(os.path.join(src, "jotform-Guy.json")))

    pw = os.environ.get("ANALYSE_PASSWUERT", "").rstrip("\r\n") or ask()   # Zeilenëmbroch vum Kopéieren an de Secret ewech
    if len(pw) < 10:
        sys.exit("Passwuert ze kuerz (mindestens 10 Zeechen).")

    payload = json.dumps({"sessions": sessions, "jotform": jotform}, ensure_ascii=False, separators=(",", ":")).encode()

    # Bestoend Datei: muss mat dësem Passwuert opgoen (soss wier de Guy ausgespaart), an nëmmen nei schreiwen wann eppes geännert huet
    if os.path.exists(OUT) and "--nei-passwuert" not in a:
        old = json.load(open(OUT))
        try:
            k = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=base64.b64decode(old["salt"]), iterations=old["iter"]).derive(pw.encode())
            plain = AESGCM(k).decrypt(base64.b64decode(old["iv"]), base64.b64decode(old["ct"]), None)
        except Exception:
            sys.exit("Passwuert passt net zur bestoender analyse.enc.json. Fir en neit Passwuert: --nei-passwuert")
        if plain == payload:
            print("Keng Ännerung, analyse.enc.json bleift.")
            return

    salt, iv = os.urandom(16), os.urandom(12)
    key = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=ITER).derive(pw.encode())
    ct = AESGCM(key).encrypt(iv, payload, None)

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump({"v": 1, "kdf": "PBKDF2-SHA256", "iter": ITER, "salt": b64(salt), "iv": b64(iv), "ct": b64(ct),
               "updated": datetime.date.today().isoformat()}, open(OUT, "w"), indent=1)
    print(f"{OUT}: {len(sessions)} Sessiounen, {len(jotform)} Jotform-Entréeën")


if __name__ == "__main__":
    main()
