#!/usr/bin/env python3
"""Seed the SANDBOX environment with realistic dummy swims for one user.

Goes through the real code path: the upload-url Lambda issues the presigned PUT,
the JSON is PUT to S3, and the confirm Lambda validates it and writes the
DynamoDB index row. Lambdas are invoked directly with a hand-built HTTP API v2
event carrying the user's Cognito `sub`, so no browser sign-in is needed.

Sandbox only, by design — it refuses any other environment.

    AWS_PROFILE=nakom.is-sandbox python3 infra/scripts/seed-sandbox-swims.py \\
        --email sandboxuser@nakomis.com [--count 16] [--seed 42]
"""

import argparse
import json
import random
import urllib.request
import uuid
from datetime import datetime, timedelta, timezone

import boto3

ENV = "sandbox"
REGION = "eu-west-2"
STROKE_FACTOR = {"freestyle": 1.0, "backstroke": 1.12, "breaststroke": 1.3, "butterfly": 1.15, "kickboard": 1.6}
STROKES_PER_25M = {"freestyle": 17, "backstroke": 19, "breaststroke": 11, "butterfly": 14, "kickboard": 0}


def iso(t: datetime) -> str:
    return t.astimezone(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def build_swim(rng: random.Random, start: datetime, pool: dict, fitness: float) -> dict:
    """A plausible session: warm-up, main sets with rests, mixed strokes, fatigue drift."""
    pool_m = pool["value"] * (0.9144 if pool["unit"] == "yd" else 1)
    sets = rng.choice([
        [("freestyle", 8), ("breaststroke", 4), ("freestyle", 16), ("backstroke", 4), ("freestyle", 8)],
        [("freestyle", 12), ("freestyle", 12), ("freestyle", 12), ("breaststroke", 6)],
        [("breaststroke", 8), ("freestyle", 20), ("kickboard", 4), ("freestyle", 10)],
        [("freestyle", 40)],
        [("freestyle", 10), ("butterfly", 2), ("freestyle", 10), ("backstroke", 6), ("breaststroke", 6)],
    ])
    if pool_m > 40:  # 50 m pool: half the lengths
        sets = [(s, max(1, n // 2)) for s, n in sets]

    base = 26.0 * (pool_m / 25) / fitness  # seconds per length, freestyle, fresh
    t = start + timedelta(seconds=rng.uniform(5, 20))
    laps, segments, pauses, hr = [], [], [], []
    lap_i = 0
    for set_i, (stroke, n) in enumerate(sets):
        seg_start = t
        for k in range(n):
            fatigue = 1 + 0.004 * lap_i + 0.01 * k
            dur = base * STROKE_FACTOR[stroke] * fatigue * rng.uniform(0.95, 1.07)
            end = t + timedelta(seconds=dur)
            lap = {
                "index": lap_i,
                "startDate": iso(t),
                "endDate": iso(end),
                "durationSeconds": round(dur, 2),
                "strokeStyle": stroke,
                "distanceMetres": round(pool_m, 2),
            }
            spl = STROKES_PER_25M[stroke]
            if spl:
                lap["strokeCount"] = max(4, round(spl * pool_m / 25 * fatigue + rng.uniform(-1.5, 1.5)))
            laps.append(lap)
            lap_i += 1
            t = end
        segments.append({"index": set_i, "startDate": iso(seg_start), "endDate": iso(t), "strokeStyle": stroke})
        if set_i < len(sets) - 1:  # rest at the wall between sets
            rest = timedelta(seconds=rng.uniform(25, 90))
            pauses.append({"startDate": iso(t), "endDate": iso(t + rest)})
            t += rest
    end = t + timedelta(seconds=rng.uniform(3, 10))

    # Heart rate every ~5 s: climbs during sets, recovers during rests.
    cur, bpm = start, 88.0
    pause_windows = [(datetime.fromisoformat(p["startDate"].replace("Z", "+00:00")),
                      datetime.fromisoformat(p["endDate"].replace("Z", "+00:00"))) for p in pauses]
    while cur < end:
        resting = any(a <= cur < b for a, b in pause_windows)
        target = 105 if resting else 138 + 12 * (1 / fitness - 0.85)
        bpm += (target - bpm) * 0.18 + rng.uniform(-2, 2)
        hr.append({"date": iso(cur), "bpm": round(bpm)})
        cur += timedelta(seconds=rng.uniform(4.5, 5.5))

    active = sum(l["durationSeconds"] for l in laps)
    elapsed = (end - start).total_seconds()
    swim = {
        "schemaVersion": 1,
        "swimId": str(uuid.uuid4()),
        "startDate": iso(start),
        "endDate": iso(end),
        "poolLength": pool,
        "totals": {
            "lapCount": len(laps),
            "distanceMetres": round(sum(l["distanceMetres"] for l in laps), 1),
            "activeDurationSeconds": round(active, 1),
            "elapsedDurationSeconds": round(elapsed, 1),
            "strokeCount": sum(l.get("strokeCount", 0) for l in laps),
            "activeEnergyKcal": round(active / 60 * rng.uniform(8.5, 10.5), 1),
        },
        "laps": laps,
        "segments": segments,
        "pauses": pauses,
        "heartRate": hr,
        "device": {"model": "Watch8,1", "osVersion": "27.0", "appVersion": "0.1.2 (17)"},
    }
    if rng.random() < 0.6:  # some swims carry depth/temperature, as if LAPC-10 were granted
        water = rng.uniform(27.2, 29.4)
        depth, temp = [], []
        cur = start
        while cur < end:
            depth.append({"date": iso(cur), "metres": round(rng.uniform(0.25, 0.6) if rng.random() < 0.9 else rng.uniform(1.0, 1.9), 2)})
            temp.append({"date": iso(cur), "celsius": round(water + rng.uniform(-0.15, 0.15), 2)})
            cur += timedelta(seconds=30)
        swim["submersion"] = {"depth": depth, "waterTemperature": temp}
    return swim


def invoke(lam, name: str, method: str, path: str, swim_id: str, sub: str) -> dict:
    event = {
        "version": "2.0",
        "routeKey": f"{method} {path.replace(swim_id, '{swimId}')}",
        "rawPath": path,
        "pathParameters": {"swimId": swim_id},
        "headers": {},
        "requestContext": {"http": {"method": method, "path": path},
                           "authorizer": {"jwt": {"claims": {"sub": sub}, "scopes": None}}},
        "isBase64Encoded": False,
    }
    res = json.load(lam.invoke(FunctionName=name, Payload=json.dumps(event))["Payload"])
    if res.get("statusCode") != 200:
        raise SystemExit(f"{name} returned {res}")
    return json.loads(res["body"])


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--email", required=True)
    ap.add_argument("--count", type=int, default=16)
    ap.add_argument("--seed", type=int, default=42)
    args = ap.parse_args()

    session = boto3.Session(region_name=REGION)
    if session.client("sts").get_caller_identity()["Account"] != "975050268859":
        raise SystemExit("Refusing: this script only seeds the sandbox account (975050268859).")

    ssm, cognito, lam = session.client("ssm"), session.client("cognito-idp"), session.client("lambda")
    pool_id = ssm.get_parameter(Name=f"/nakomis-infra/{ENV}/cognito/user-pool-id")["Parameter"]["Value"]
    users = cognito.list_users(UserPoolId=pool_id, Filter=f'email = "{args.email}"')["Users"]
    if not users:
        raise SystemExit(f"No user {args.email} in {pool_id}")
    sub = next(a["Value"] for a in users[0]["Attributes"] if a["Name"] == "sub")

    rng = random.Random(args.seed)
    now = datetime.now(timezone.utc).replace(second=0, microsecond=0)
    for i in range(args.count):
        days_ago = (args.count - i) * rng.uniform(2.2, 3.4)
        start = (now - timedelta(days=days_ago)).replace(hour=rng.choice([7, 7, 12, 18]), minute=rng.choice([0, 15, 30, 45]))
        pool = rng.choices([{"value": 25, "unit": "m"}, {"value": 50, "unit": "m"}, {"value": 25, "unit": "yd"}], [8, 1, 1])[0]
        fitness = 0.85 + 0.2 * i / max(1, args.count - 1)  # gently improving over the weeks
        swim = build_swim(rng, start, pool, fitness)
        sid = swim["swimId"]
        up = invoke(lam, f"lapcat-upload-url-{ENV}", "POST", f"/swims/{sid}/upload-url", sid, sub)
        req = urllib.request.Request(up["uploadUrl"], data=json.dumps(swim).encode(), method="PUT",
                                     headers={"Content-Type": "application/json"})
        urllib.request.urlopen(req).read()
        summary = invoke(lam, f"lapcat-confirm-{ENV}", "POST", f"/swims/{sid}", sid, sub)
        print(f"{summary['startDate'][:16]}  {summary['lapCount']:3d} laps  {summary['distanceMetres']:7.1f} m  "
              f"{swim['poolLength']['value']}{swim['poolLength']['unit']}  {'temp' if 'submersion' in swim else '    '}  {sid}")


if __name__ == "__main__":
    main()
