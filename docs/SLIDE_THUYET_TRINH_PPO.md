# Dàn ý Slide & Kịch bản Thuyết trình: Thuật toán PPO & Pipeline Đánh giá (Nguyễn Tùng Dương)

> Tài liệu chuẩn bị cho buổi báo cáo kết quả thực nghiệm & bảo vệ phần **Thuật toán PPO (on-policy)** và **Pipeline Đánh giá Dùng chung (`evaluate_all.py`)** của Nhóm 7 – SEMS-RL.

---

## Cấu trúc 8 Slide trọng tâm (Phần Dương phụ trách)

### Slide 1: Tổng quan vai trò & Chuẩn hóa giao thức đánh giá (`sems-daily-v1`)
* **Mục tiêu:** Bảo đảm 4 thuật toán (`SAC`, `TD3`, `PPO`, `DDQN`) và 2 mốc đối chuẩn (`No-battery`, `Rule-based`) được so sánh công bằng trên **cùng dữ liệu (`processed.csv`), cùng kịch bản S1–S5, cùng `initial_soc = 0.5` và cùng hàm đo KPI**.
* **Cơ chế kỹ thuật chính:**
  * `ScenarioWrapper` (tương thích `sac-daily-v1` của Trường): xử lý chuyển tiếp quan sát `00:00` ngày kế tiếp khi `truncated=True`, và ngắt `terminated=True` tại biên phân vùng `train/val/test` để tránh rò rỉ dữ liệu tương lai.
  * Kiểm soát công bằng: `protocol_fingerprint()` (SHA-256 môi trường + dữ liệu + tham số đánh giá), đánh giá theo cặp cùng ngày với `No-battery`.

---

### Slide 2: Chuẩn hóa đo lường & Điều chỉnh tồn kho cuối ngày
* **Vấn đề khi chỉ nhìn hóa đơn điện gốc $J_{\text{elec}}$:** Chính sách xả cạn pin cuối ngày ($SoC: 0.50 \to 0.20$) ăn gian được tiền điện miễn phí từ năng lượng tồn đầu ngày.
* **Giải pháp đo lường trong `episode_metrics()`:**
  * $\Delta_{\text{tồn kho}} = (SoC_0 - SoC_T) \cdot E_{\text{cap}} \cdot \eta_d \cdot \bar{C}_{\text{train}}$
  * **Tiền điện ĐC tồn kho** = $J_{\text{điện}} + \Delta_{\text{tồn kho}}$ (tính **Tiết kiệm ĐC %**)
  * **Tổng ĐC** = $J_{\text{điện}} + C_{\text{hao mòn}} + C_{\text{phạt đỉnh}} + \Delta_{\text{tồn kho}}$ (tiêu chí chọn `best.zip`).
* **Thống kê đa seed:** Tách bạch `std_seeds` (`ddof=1` giữa trung bình các seed) với Bootstrap 95% CI trên trung bình theo ngày (`n = 56` ngày Test), tránh hiểu nhầm độ ổn định.

---

### Slide 3: Kiến trúc `evaluate_all.py` & Khả năng cắm chéo đa thuật toán
* **Luồng tự động:** `metadata.json` -> `infer_run_identity()` -> nạp `.zip` (SB3 PPO/SAC/TD3/DQN) hoặc `.pt` (PyTorch tự viết) -> đánh giá S1–S5 -> xuất CSV, `report_table.md`, 5 nhóm biểu đồ PNG.
* **Điểm nhấn kỹ thuật:**
  * Tự động giải mã hành động rời rạc $k \in \{0,\dots,10\} \mapsto [-1, 1]$ cho SB3 DQN, đồng thời không cắt nhầm hành động liên tục `float32` của `DDQNAgent` tự viết.
  * Không sử dụng tập Test trong suốt quá trình tinh chỉnh & chọn mô hình (`test_used_for_selection: false`).
* **Kiểm chứng:** 8/8 bài test môi trường + 17/17 bài test đơn vị & CLI tích hợp đều đạt.

---

### Slide 4: Chẩn đoán sự cố "Sập xả cực đại" của PPO cấu hình gốc TH2
* **Hiện tượng:** Khi chạy cấu hình TH2 gốc (`[64, 64]`, không `gSDE`, không `norm_reward`), PPO nhanh chóng hội tụ nhầm vào chiến lược xả `a = -1.0` suốt 92/96 bước -> `Tổng ĐC` tăng từ `864k` lên `940k đ/ngày`.
* **Lý giải cơ học:**
  * Điểm hòa vốn mua-sạc để xả cao điểm là $P_{\text{hòa vốn}} \approx 2,322\text{ đ/kWh}$ ($\eta_c\eta_d = 0.8464$, $c_{\text{wear}} = 468.75\text{ đ/kWh}$).
  * Vì PPO là **on-policy** với nhiễu Gaussian độc lập từng bước 15 phút và mạng Value chưa kịp hội tụ ở các rollout đầu, năng lượng sạc ở `00h–02h` bị nhiễu xả mất trước giờ cao điểm `09h30`/`17h`, khiến GAE đẩy kỳ vọng $\mu(s) \to -1.0$.

---

### Slide 5: Quá trình tinh chỉnh có kiểm soát (7 cấu hình Ablation trên Validation S5)
* **Minh họa:** Chèn biểu đồ [ablation_tuning.png](ppo_results/ablation_tuning.png).
* **4 bước cải tiến then chốt để ra `ppo_sde_stable.yaml`:**
  1. Mở rộng mạng `[256, 256]` (khắc phục thiếu dung lượng biểu diễn của `[64, 64]`).
  2. Thay nhiễu độc lập từng bước bằng **gSDE** (`use_sde=True, sde_sample_freq=8`, giữ thăm dò nhất quán theo khối 2 giờ).
  3. Bật `VecNormalize(norm_reward=True)` để ổn định Value loss.
  4. Siết trust-region (`clip_range=0.12`, `target_kl=0.01`, `lr=1.5e-4` linear) để chặn cú sập KL tại bước 50k như `ppo_sde.yaml`.
* **Kết quả chốt tinh chỉnh (`seed 0`):** Vượt cả `No-battery (861.4k)` lẫn `Rule-based (850.0k)` xuống còn **`842,379 đ/ngày`**.

---

### Slide 6: Kết quả chính thức 5 seeds × 300.000 bước (Validation & Test)
* **Minh họa:** Chèn [learning_comparison.png](ppo_results/val/learning_comparison.png) và bảng tóm tắt từ [report_table.md](ppo_results/test/report_table.md).
* **Nhận xét trung thực hai mặt:**
  * **`seed 0` & `seed 1` hội tụ xuất sắc:** Trên Test `S1`, tổng ĐC đạt `738,437–738,462 đ/ngày` (rẻ hơn cả `No-battery 749,529 đ` lẫn `Rule-based 749,912 đ`); trên `S5`, tiết kiệm **28.4%–30.1%** hóa đơn gốc (**11.4%–13.2%** ĐC tồn kho).
  * **`seed 2, 3, 4` giữ `best_step = 0`:** Kéo trung bình 5 seeds trên Test `S5` xuống **+11.63% gốc / +4.86% ĐC tồn kho** (`695,970 đ` tổng ĐC). Đây là bằng chứng định lượng cho độ nhạy rollout đầu của **on-policy PPO** khi đối chiếu với **off-policy (SAC/TD3/DDQN)**.

---

### Slide 7: Phân tích hành vi vận hành 24 giờ & Trade-off pin
* **Minh họa:** Chèn [example_day_S1.png](ppo_results/test/example_day_S1.png) và [tradeoff.png](ppo_results/test/tradeoff.png).
* **Hành vi học được (`seed 1` trên `S1`):**
  * **00:00–02:00 (thấp điểm 1,100 đ):** Chủ động sạc pin từ ~50% lên trần an toàn **90%**.
  * **10:00–16:00:** Phụ tải được PV đáp ứng hoàn toàn, pin giữ trạng thái chờ.
  * **17:00–20:00 (cao điểm 3,000 đ):** Xả mượt về **20%** đúng khung giờ đắt nhất, giảm mạnh lượng điện mua lưới buổi tối, **0 vi phạm biên SoC**.
* **Giới hạn Peak Shaving trên bộ dữ liệu:** Đỉnh `No-battery` chỉ đạt `47.2 kW` (`S1`)–`53.3 kW` (`S3`) (< ngưỡng phạt `90 kW`), nên `peak_shaving_pct < 0` lúc sạc đêm không gây phạt quá tải lưới (`peak_penalty = 0`).

---

### Slide 8: Câu hỏi vấn đáp dự kiến & Trả lời ngắn gọn

1. **Vì sao trung bình 5 seeds PPO lại thấp hơn Rule-based dù có seed vượt trội?**
   > Do PPO là on-policy (không có Replay Buffer), 3/5 seed rơi vào cực tiểu cục bộ xả sớm ở vài rollout đầu trước khi Critic học được lợi ích trễ 9.5 giờ nên bộ chọn checkpoint an toàn giữ mốc `best_step=0`. Nếu xét các seed hội tụ (`seed 0, 1`), PPO tổng quát hóa sang tập Test rất tốt và vượt Rule-based ở S1 về Tổng ĐC.
2. **Vì sao không train PPO trên GPU CUDA cho đợt 300k bước?**
   > Đã cài và kiểm thử chạy được CUDA trên RTX 4060 (`PyTorch 2.14.1+cu130`), nhưng với MLP nhỏ (`7-256-256-1`) và môi trường CPU đơn bước, chi phí chuyển tensor CPU–GPU lớn hơn chi phí tính toán nên CPU nhanh hơn (~80s/153k bước vs ~100s/80k bước trên CUDA), đúng khuyến nghị của Stable-Baselines3.
3. **Làm sao đảm bảo `evaluate_all.py` so sánh công bằng với SAC/TD3/DDQN của các bạn khác?**
   > Nhờ `protocol_fingerprint()` khóa SHA-256 của `processed.csv` + `sems_rl/config.yaml` + cấu hình đánh giá, dùng chung `ScenarioWrapper` S1–S5 với `initial_soc=0.5`, và giữ nguyên đầu ra liên tục của `DDQNAgent` tự viết vs giải mã số nguyên cho SB3 DQN.
