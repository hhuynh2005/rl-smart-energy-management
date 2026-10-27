import sys
import urllib.request
import json

for stream in [sys.stdout, sys.stderr]:
    if hasattr(stream, "reconfigure"):
        try:
            stream.reconfigure(encoding="utf-8")
        except Exception:
            pass


def test_endpoints():
    print("Testing GET / ...")
    with urllib.request.urlopen("http://127.0.0.1:8000/") as res:
        html = res.read().decode("utf-8")
        assert res.status == 200
        assert "SEMS-RL" in html
        assert 'id="root"' in html
        print("  -> GET / OK (HTML served, React bundle linked)")

    print("Testing GET /api/scenarios ...")
    with urllib.request.urlopen("http://127.0.0.1:8000/api/scenarios") as res:
        data = json.loads(res.read().decode("utf-8"))
        assert len(data["scenarios"]) == 5
        print(f"  -> GET /api/scenarios OK ({len(data['scenarios'])} scenarios, specs: BESS {data['specs']['battery_capacity_kwh']} kWh)")

    print("Testing POST /api/simulate (Scenario 1, RBC) ...")
    body = json.dumps({
        "scenario": "S1: Ngày làm việc điển hình (Typical Weekday)",
        "policy_mode": "rbc",
        "initial_soc": 0.50
    }).encode("utf-8")
    req = urllib.request.Request("http://127.0.0.1:8000/api/simulate", data=body, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req) as res:
        sim = json.loads(res.read().decode("utf-8"))
        assert sim["success"] is True
        assert len(sim["timeline"]) == 96
        cost = sim["kpi_metrics"]["daily_cost_j"]
        saving = sim["kpi_metrics"]["cost_saving_pct"]
        peak = sim["kpi_metrics"]["peak_buy_kw"]
        print(f"  -> POST /api/simulate OK (96 steps, Daily Cost: {cost:,.0f} đ, Savings: {saving:.1f}%, Peak: {peak:.1f} kW)")

    print("\nALL HTTP ENDPOINT TESTS PASSED SUCCESSFULLY!")

if __name__ == "__main__":
    test_endpoints()
