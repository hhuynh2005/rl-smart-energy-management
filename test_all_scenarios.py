import sys
import urllib.request
import json

for stream in [sys.stdout, sys.stderr]:
    if hasattr(stream, "reconfigure"):
        try:
            stream.reconfigure(encoding="utf-8")
        except Exception:
            pass

def get_base_url():
    for port in [8080, 8000, 8001]:
        try:
            with urllib.request.urlopen(f"http://127.0.0.1:{port}/api/health", timeout=1) as res:
                if res.status == 200:
                    return f"http://127.0.0.1:{port}"
        except Exception:
            continue
    return "http://127.0.0.1:8080"

def test_all():
    base = get_base_url()
    print(f"Connecting to SEMS-RL API at {base} ...")
    scenarios = [
        ("S1: Ngày làm việc điển hình (Typical Weekday)", "rbc"),
        ("S2: Ngày cuối tuần (Weekend - Tải thấp, không giờ cao điểm)", "rbc"),
        ("S3: Ngày nhiều mây (Cloudy Day - PV giảm 50%)", "rbc"),
        ("S4: Thử độ bền với Nhiễu (Robustness Test - NoiseWrapper)", "rbc"),
        ("S5: Tùy chọn ngày tự do (Custom Date Picker)", "custom"),
    ]

    for sc, pol in scenarios:
        body = json.dumps({
            "scenario": sc,
            "policy_mode": pol,
            "initial_soc": 0.50
        }).encode("utf-8")
        req = urllib.request.Request(f"{base}/api/simulate", data=body, headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req) as res:
            data = json.loads(res.read().decode("utf-8"))
            assert data["success"] is True
            assert len(data["timeline"]) == 96
            kpi = data["kpi_metrics"]
            print(f"[{sc[:2]}] Policy={pol:<6} | Chi phí={kpi['daily_cost_j']:>9,.0f} đ | Đỉnh={kpi['peak_buy_kw']:>5.1f} kW | Tự dùng PV={kpi['pv_self_consumption_pct']:>5.1f}% | EFC={kpi['efc']:.3f}")

    print(f"\n✓ ĐÃ KIỂM THỬ THÀNH CÔNG TẤT CẢ 5 KỊCH BẢN VẬN HÀNH TRÊN {base}!")

if __name__ == "__main__":
    test_all()
