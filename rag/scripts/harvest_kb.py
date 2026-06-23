"""Bulk-harvest CC-BY open-access exercise/nutrition full texts into the KB.

Discovery via Europe PMC (open-access + CC license, restricted to publishers we
can reliably extract). Fetch via requests(browser UA) + trafilatura on publisher
HTML. Trailing back-matter (References/Abbreviations/Funding/...) is trimmed.

Writes data/auto_epmc_<pmcid>.txt with a provenance header and rebuilds
data/harvested_sources.json. Re-runs are idempotent: PMCIDs already on disk are
skipped, so it only tops up toward TARGET.

Usage (from rag/):
  ./.venv/Scripts/python scripts/harvest_kb.py          # top up to TARGET
  ./.venv/Scripts/python scripts/harvest_kb.py --target 120

Requires: requests, trafilatura (see requirements-ingest-ci.txt + trafilatura).
Note: MDPI and PMC HTML block this extractor; Frontiers / PLOS / PeerJ /
SpringerOpen / BMC work — hence the journal allow-list below.
"""
from __future__ import annotations

import argparse
import json
import re
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import requests

RAG_ROOT = Path(__file__).resolve().parents[1]
DATA = RAG_ROOT / "data"
MANIFEST = DATA / "harvested_sources.json"

UA = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
}
MIN_BODY = 2500
PER_TOPIC = 14
WRITE_PER_TOPIC = 5  # cap written docs per topic so no topic dominates the KB

OK_HOSTS = (
    "frontiersin.org", "journals.plos.org", "biomedcentral.com",
    "peerj.com", "sportsmedicine-open.springeropen.com", "springeropen.com",
)

JFILTER = (
    '(JOURNAL:"Frontiers in Physiology" OR JOURNAL:"Frontiers in Nutrition" OR '
    'JOURNAL:"Frontiers in Sports and Active Living" OR JOURNAL:"PLoS One" OR '
    'JOURNAL:"PeerJ" OR JOURNAL:"Sports Medicine - Open" OR '
    'JOURNAL:"BMC Sports Science, Medicine and Rehabilitation" OR '
    'JOURNAL:"Journal of the International Society of Sports Nutrition" OR '
    'JOURNAL:"European journal of applied physiology" OR '
    'JOURNAL:"Sports" OR JOURNAL:"Nutrients" OR '
    'JOURNAL:"International journal of environmental research and public health" OR '
    'JOURNAL:"Journal of functional morphology and kinesiology" OR '
    'JOURNAL:"Biology of sport" OR JOURNAL:"Frontiers in sports and active living")'
)

# PMC BioC full-text API works for the whole PMC open-access subset (incl. MDPI,
# which blocks HTML scraping), so we fetch text from there instead of publisher HTML.
BIOC_URL = "https://www.ncbi.nlm.nih.gov/research/bionlp/RESTful/pmcoa.cgi/BioC_json/{}/unicode"
_DROP_SEC = {"REF", "TABLE", "FIG", "COMP_INT", "AUTH_CONT", "ACK_FUND",
             "SUPPL", "ABBR", "KEYWORD"}


def fetch_bioc(pmcid):
    """Return clean body text for a PMC OA article via the BioC API, or None."""
    try:
        r = requests.get(BIOC_URL.format(pmcid), headers=UA, timeout=(8, 45))
    except Exception:
        return None
    if r.status_code != 200 or not r.text:
        return None
    try:
        j = r.json()
    except Exception:
        return None
    docs = j if isinstance(j, list) else [j]
    parts = []
    for d in docs:
        for doc in d.get("documents", []):
            for p in doc.get("passages", []):
                sec = p.get("infons", {}).get("section_type", "")
                if sec in _DROP_SEC:
                    continue
                t = (p.get("text") or "").strip()
                if t:
                    parts.append(t)
    body = "\n".join(parts).strip()
    return body if len(body) >= MIN_BODY else None

TOPICS = [
    # ── Training programming / sets / volume (under-covered) ─────────────
    ("rt_volume", "resistance training volume muscle hypertrophy dose response sets per week", ["volume", "hypertrophy"], "training volume; sets; hypertrophy"),
    ("rt_frequency", "resistance training frequency muscle strength hypertrophy weekly", ["frequency"], "training frequency; hypertrophy; strength"),
    ("rt_intensity_load", "resistance training load intensity repetition range strength hypertrophy", ["load", "intensity"], "training load; intensity; rep range"),
    ("rt_failure_rir", "resistance training to failure repetitions in reserve hypertrophy", ["failure", "reserve"], "failure; RIR; effort"),
    ("rt_rom", "range of motion resistance training muscle hypertrophy partial full", ["range of motion"], "range of motion; hypertrophy"),
    ("rt_tempo_eccentric", "movement tempo eccentric resistance training hypertrophy strength", ["tempo", "eccentric"], "tempo; eccentric; hypertrophy"),
    ("periodization2", "periodization resistance training strength program undulating linear", ["periodization"], "periodization; programming; strength"),
    ("progressive_overload", "progressive overload resistance training adaptation load progression", ["overload", "progressive"], "progressive overload; adaptation"),
    ("rest_intervals2", "rest interval duration resistance training hypertrophy strength between sets", ["rest interval", "rest period"], "rest interval; recovery; hypertrophy"),
    ("exercise_order", "exercise order sequence resistance training strength session", ["exercise order", "sequence"], "exercise order; programming"),
    ("exercise_selection", "exercise selection muscle activation resistance training hypertrophy", ["exercise selection", "muscle activation"], "exercise selection; muscle activation"),
    ("training_split", "training split full body upper lower resistance training", ["split", "full body"], "training split; programming"),
    ("autoregulation_rpe", "autoregulation rating of perceived exertion velocity based training", ["autoregulation", "perceived exertion", "velocity"], "autoregulation; RPE; VBT"),
    ("bfr", "blood flow restriction training muscle hypertrophy strength", ["blood flow restriction", "occlusion"], "blood flow restriction; hypertrophy"),
    ("free_vs_machine", "free weights versus machines resistance training muscle strength", ["free weight", "machine"], "free weights; machines; selection"),
    # ── Exercise technique / biomechanics (NEW) ──────────────────────────
    ("squat_biomech", "back squat biomechanics depth muscle activation kinematics technique", ["squat"], "squat; technique; biomechanics"),
    ("deadlift_biomech", "deadlift biomechanics technique muscle activation conventional sumo", ["deadlift"], "deadlift; technique; biomechanics"),
    ("bench_press_biomech", "bench press biomechanics grip width muscle activation technique", ["bench press"], "bench press; technique; biomechanics"),
    ("hip_thrust", "hip thrust gluteus muscle activation exercise biomechanics", ["hip thrust", "gluteus"], "hip thrust; glutes; technique"),
    ("overhead_press", "overhead press shoulder press muscle activation technique", ["overhead press", "shoulder press"], "overhead press; shoulder; technique"),
    ("row_pulldown", "rowing lat pulldown back muscle activation exercise technique", ["pulldown", "row"], "row; pulldown; back; technique"),
    ("emg_activation", "electromyography muscle activation comparison resistance exercises", ["electromyography", "muscle activation"], "EMG; muscle activation; exercise"),
    ("lifting_technique", "weightlifting lifting technique form kinematics resistance training", ["technique", "lifting"], "lifting technique; form; kinematics"),
    # ── Injury / pain / rehabilitation (NEW) ─────────────────────────────
    ("injury_epi", "resistance training weightlifting injury epidemiology prevalence", ["injury", "injuries"], "injury; epidemiology; resistance training"),
    ("injury_prevention", "injury prevention program exercise strength training", ["injury", "prevention"], "injury prevention; program"),
    ("low_back_pain", "low back pain exercise resistance training management", ["back pain", "low back"], "low back pain; exercise; rehab"),
    ("knee_pain", "patellofemoral knee pain exercise rehabilitation strengthening", ["knee", "patellofemoral"], "knee pain; patellofemoral; rehab"),
    ("shoulder_pain", "shoulder pain impingement rotator cuff exercise rehabilitation", ["shoulder", "rotator cuff"], "shoulder; rotator cuff; rehab"),
    ("tendinopathy", "tendinopathy loading exercise rehabilitation tendon", ["tendinopathy", "tendon"], "tendinopathy; loading; rehab"),
    ("return_to_sport", "return to sport rehabilitation strength criteria", ["return to sport", "rehabilitation"], "return to sport; rehab"),
    # ── Recovery (under-covered) ─────────────────────────────────────────
    ("sleep_performance", "sleep extension athletes performance recovery", ["sleep"], "sleep; recovery; performance"),
    ("cwi_recovery", "cold water immersion recovery exercise muscle adaptation", ["cold water", "immersion"], "cold water immersion; recovery"),
    ("foam_rolling", "foam rolling self myofascial release recovery range of motion", ["foam", "myofascial"], "foam rolling; recovery; mobility"),
    ("doms_recovery", "delayed onset muscle soreness recovery strategies", ["soreness", "doms"], "DOMS; soreness; recovery"),
    ("massage_recovery", "massage compression garments recovery exercise performance", ["massage", "compression"], "massage; compression; recovery"),
    ("active_recovery", "active recovery between sessions exercise performance", ["active recovery"], "active recovery; between sessions"),
    ("overtraining", "overtraining overreaching syndrome monitoring fatigue athletes", ["overtraining", "overreaching"], "overtraining; overreaching; fatigue"),
    ("hrv_monitoring", "heart rate variability monitoring training load recovery", ["heart rate variability"], "HRV; monitoring; recovery"),
    ("stretching", "stretching flexibility performance resistance training", ["stretching", "flexibility"], "stretching; flexibility; performance"),
    ("muscle_damage", "exercise induced muscle damage recovery adaptation", ["muscle damage"], "muscle damage; recovery; adaptation"),
    ("warmup2", "warm up resistance training performance preparation", ["warm-up", "warm up"], "warm-up; preparation; performance"),
    ("detraining", "detraining muscle strength loss retraining", ["detraining"], "detraining; muscle loss; retraining"),
    # ── Cardio / endurance / health (under-covered) ──────────────────────
    ("hiit", "high intensity interval training cardiovascular fitness adaptation", ["interval", "hiit"], "HIIT; cardio; fitness"),
    ("vo2max_endurance", "endurance training VO2max aerobic adaptation", ["vo2", "endurance"], "endurance; VO2max; aerobic"),
    ("concurrent2", "concurrent aerobic strength training interference effect", ["concurrent", "interference"], "concurrent training; interference"),
    ("rt_health", "resistance training health metabolic cardiovascular benefits all-cause", ["resistance training", "health"], "resistance training; health; metabolic"),
    # ── Special populations (under-covered) ──────────────────────────────
    ("youth_rt", "resistance training children adolescents youth safety", ["youth", "adolescent", "children"], "youth; adolescents; resistance training"),
    ("pregnancy_exercise", "exercise during pregnancy resistance training safety", ["pregnancy", "pregnant"], "pregnancy; exercise; safety"),
    ("women_menstrual", "menstrual cycle exercise performance women athletes", ["menstrual", "women"], "women; menstrual cycle; performance"),
    ("masters_athletes", "masters athletes aging resistance training performance", ["masters", "aging"], "masters; aging; performance"),
    # ── Body composition / fat loss (moderate) ───────────────────────────
    ("fat_loss", "weight loss diet body composition resistance training muscle retention", ["weight", "fat"], "fat loss; diet; muscle retention"),
    ("bodyrecomp", "body recomposition simultaneous fat loss muscle gain", ["recomposition"], "body recomposition; fat loss; muscle gain"),
    # ── Hydration / supplements not yet covered ──────────────────────────
    ("hydration2", "hydration fluid balance exercise electrolytes sodium performance", ["hydration", "fluid"], "hydration; fluid; electrolytes"),
    ("pre_workout", "multi-ingredient pre-workout supplement performance", ["pre-workout", "pre workout"], "pre-workout; supplement; performance"),
    ("nitrate_beetroot", "dietary nitrate beetroot juice exercise performance", ["nitrate", "beetroot"], "nitrate; beetroot; endurance"),
    ("carbohydrate", "carbohydrate intake endurance performance glycogen", ["carbohydrate", "glycogen"], "carbohydrate; glycogen; endurance"),
]

CITE_RE = re.compile(r"\bdoi\b|10\.\d{4,}/|(19|20)\d{2}\s*[;:]|pubmed", re.IGNORECASE)
BACK = {
    "references", "reference", "bibliography", "literature cited",
    "acknowledgements", "acknowledgments", "abbreviations",
    "conflict of interest", "conflicts of interest",
    "declaration of competing interest", "competing interests",
    "funding", "funding statement", "author contributions",
    "data availability", "data availability statement",
    "supplementary material", "supplementary materials",
    "ethics statement", "ethical approval", "orcid", "footnotes",
    "disclosure statement", "informed consent statement",
    "institutional review board statement", "conflict of interest statement",
}


def epmc_search(query, n=40):
    q = (f"({query}) AND {JFILTER} AND (OPEN_ACCESS:Y) AND (LICENSE:cc) "
         "AND (IN_EPMC:Y) AND (HAS_FT:Y)")
    try:
        r = requests.get(
            "https://www.ebi.ac.uk/europepmc/webservices/rest/search",
            params={"query": q, "format": "json", "pageSize": n, "resultType": "core"},
            timeout=60,
        ).json()
    except Exception as e:
        print("  search err", repr(e)[:80])
        return []
    return r.get("resultList", {}).get("result", [])


def trim_refs(text):
    lines = text.splitlines()
    n = len(lines)
    if n >= 60:
        starts = [i for i, ln in enumerate(lines) if CITE_RE.search(ln)]
        if len(starts) >= 15:
            for s in starts:
                if s < n * 0.3:
                    continue
                tail = [x for x in starts if x >= s]
                if len(tail) >= 15 and len(tail) >= 0.2 * (n - s):
                    trimmed = "\n".join(lines[:s]).rstrip()
                    if len(trimmed) >= MIN_BODY:
                        text = trimmed + "\n"
                        lines = text.splitlines()
                        n = len(lines)
                    break
    # secondary: cut at a back-matter heading in the last 45%
    for i, ln in enumerate(lines):
        if i < n * 0.55:
            continue
        if ln.strip().lstrip("#-* ").strip().rstrip(":").lower() in BACK:
            return "\n".join(lines[:i]).rstrip() + "\n"
    return text


def fmt_license(lic):
    lic = (lic or "").strip()
    return lic.upper() if lic.lower().startswith("cc") else "CC (open access)"


def fetch_one(cand):
    body = fetch_bioc(cand["pmcid"])
    if not body:
        return None
    if not any(k in (cand["title"] + " " + body[:3000]).lower() for k in cand["kws"]):
        return None
    url = cand.get("url") or f"https://pmc.ncbi.nlm.nih.gov/articles/{cand['pmcid']}/"
    return {**cand, "url": url, "body": trim_refs(body)}


def rebuild_manifest():
    out = []
    for p in sorted(DATA.glob("auto_epmc_*.txt")):
        head = {}
        for ln in p.read_text(encoding="utf-8").splitlines()[:4]:
            if ":" in ln:
                k, v = ln.split(":", 1)
                head[k.strip().lower()] = v.strip()
        out.append({"file": p.name, "pmcid": p.name[10:-4],
                    "title": head.get("title", ""), "url": head.get("source url", ""),
                    "license": head.get("license", ""), "tags": head.get("tags", "")})
    MANIFEST.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
    return len(out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--target", type=int, default=90, help="total epmc docs on disk to reach")
    args = ap.parse_args()

    seen = {p.name[10:-4] for p in DATA.glob("auto_epmc_*.txt")}
    print(f"[init] {len(seen)} epmc docs on disk; target {args.target}", flush=True)

    cands = []
    for key, query, kws, tags in TOPICS:
        got = 0
        for x in epmc_search(query):
            if got >= PER_TOPIC:
                break
            pmcid, doi = x.get("pmcid"), x.get("doi")
            if not pmcid or not doi or pmcid in seen:
                continue
            if not (x.get("license") or "").lower().startswith("cc"):
                continue
            seen.add(pmcid)
            cands.append({"pmcid": pmcid, "doi": doi,
                          "title": (x.get("title") or "").strip().rstrip("."),
                          "license": fmt_license(x.get("license")), "tags": tags,
                          "kws": kws, "topic": key})
            got += 1
    print(f"[fetch] {len(cands)} candidates, parallel...", flush=True)

    count = len(list(DATA.glob("auto_epmc_*.txt")))
    import collections
    per_topic = collections.Counter()
    ex = ThreadPoolExecutor(max_workers=12)
    try:
        futs = [ex.submit(fetch_one, c) for c in cands]
        for fut in as_completed(futs):
            if count >= args.target:
                break
            r = fut.result()
            if not r:
                continue
            if per_topic[r["topic"]] >= WRITE_PER_TOPIC:
                continue
            per_topic[r["topic"]] += 1
            (DATA / f"auto_epmc_{r['pmcid']}.txt").write_text(
                f"Title: {r['title']}\nSource URL: {r['url']}\n"
                f"License: {r['license']}\nTags: {r['tags']}\n\n"
                + r["body"].strip() + "\n", encoding="utf-8")
            count += 1
            print(f"   [ok {count}] {r['pmcid']} {r['topic']}", flush=True)
    finally:
        ex.shutdown(wait=False, cancel_futures=True)

    total = rebuild_manifest()
    print(f"[done] epmc docs on disk={total}", flush=True)


if __name__ == "__main__":
    raise SystemExit(main())
