# Thiết kế: Double DQN + Dueling cho SEMS-RL

Ngày: 2026-11-26 · Nhánh: `ly-son-DQN` · Người làm: Lý Đình Sơn (đảm nhận toàn bộ phần DDQN, thay vị trí "Ly chính, Sơn hỗ trợ" trong báo cáo TH2).

## 1. Ý định và lý do

Nhóm cần một thuật toán **giá trị, hành động rời rạc** để đối chuẩn với SAC, TD3, PPO (điều khiển liên tục). Kết quả DDQN cho biết việc rời rạc hóa 11 mức làm mất bao nhiêu hiệu quả so với điều khiển liên tục (báo cáo TH2, mục 3.5). Kể cả khi DDQN kém hơn, con số đó vẫn là kết quả của đồ án.

Thuật toán viết tay bằng PyTorch, theo bài báo Double DQN (van Hasselt và cộng sự, 2015) và kiến trúc Dueling (Wang và cộng sự, 2015). Mục tiêu thứ hai là **trình diễn trực quan**: chạy trên giao diện 3D hiện có và có dashboard riêng cho huấn luyện.

## 2. Mục tiêu / Không phải mục tiêu / Điều phải tránh

**Mục tiêu**
- `DDQNAgent` tự viết: mạng Dueling, Double Q target, replay buffer, ε-greedy, Huber, cắt gradient, cập nhật mềm mạng đích; lưu/nạp checkpoint.
- Huấn luyện, chọn mô hình tốt nhất bằng validation, đánh giá S1–S5 theo **đúng giao thức của SAC** (`sac-daily-v1`) để so sánh công bằng.
- Demo 3D chạy quyết định thật của DDQN, kèm thanh Q-value 11 mức (và V, A).
- Dashboard Streamlit: đường cong học, so sánh với SAC/RBC/no-battery, xem Q/V/A từng bước.

**Không phải mục tiêu**
- Cập nhật cứng kiểu DQN Nature 2015 (đã chọn cập nhật mềm; xem mục 4).
- Huấn luyện trong trình duyệt hoặc trong 3D.
- Prioritized replay, noisy nets, distributional, n-step (không thuộc "bản 2015").
- Chỉnh sửa môi trường, hàm thưởng, `sac.py`, `train_sac.py`, `sac_experiment.py` (phần của người khác).

**Điều phải tránh (thất bại dù chạy được)**
- Chọn mô hình hoặc chỉnh siêu tham số bằng tập test.
- Khi thiếu checkpoint, API/dashboard âm thầm thay bằng luật cứng. Phải báo lỗi rõ, như quy ước của `dashboard_sac.py`.
- Đưa chỉ số 0–10 thẳng vào môi trường gốc (xem mục 5).

## 3. Ràng buộc đã có trong repo

- Quan sát 7 chiều, hành động liên tục 1 chiều [-1, 1]; hành động rời rạc: `a = -1 + 2k/(K-1)`, K=11, k=5 là pin nghỉ. Lệnh vẫn đi qua Safety Guardrail.
- Giao thức SAC (`sems_rl/experiments/sac_experiment.py`): `make_env`, `evaluate_policy`, `episode_metrics`, `TrainingRecorder` (trong `train_sac.py`), `evaluate_sac.aggregate_results`. Chỉ `terminated` tắt bootstrap; cuối ngày (`truncated`) môi trường SAC tiếp tục sang ngày kế với SoC giữ nguyên.
- Tiêu chí chọn mô hình: `adjusted_total_cost_vnd_mean` trên validation (thấp hơn là tốt hơn).
- Python ≥3.10, PyTorch, Gymnasium 1.x (wrapper không tự chuyển tiếp thuộc tính; `evaluate_policy` cần `env.scenario` và `env.unwrapped`).

## 4. Phương án đã cân nhắc

**Cập nhật mạng đích:** (A) mềm τ=0.005 theo mã giả TH2; (B) cứng mỗi C bước như Nature 2015; (C) cả hai. **Đã chọn A**, vì khớp mã giả đã nộp và cùng cơ chế với SAC/TD3. Cập nhật cứng bị loại khỏi phạm vi.

**Phần trực quan:** (1) chỉ 3D; (2) chỉ Streamlit; (3) kết hợp. **Đã chọn 3**: 3D chỉ phát lại suy luận; Streamlit lo đường cong học và phần giải thích Q; Q-values đưa vào cả 3D.

## 5. Quyết định thiết kế

**Đã chốt cùng bạn:** Double Q target (chọn bằng mạng chính, đánh giá bằng mạng đích); Dueling `Q = V + A − mean_k A`; siêu tham số theo TH2: 2 lớp ẩn 256 ReLU, Adam 1e-4, Huber, cắt gradient chuẩn 10, γ=0.99, τ=0.005, batch 256, buffer 200.000, `learning_starts` 5.000, ε 1.0→0.05 tuyến tính trong 50.000 bước, tổng 300.000 bước, 5 seed (0–4), K=11.

**Quyết định của tôi (cần bạn kiểm tra):**
1. **Không bọc `DiscretizeActionWrapper` ngoài môi trường SAC.** Agent giữ bảng `action_grid` (cùng công thức với wrapper), buffer lưu chỉ số k. `predict()` trả hành động **liên tục** `np.array([a], float32)` để `evaluate_policy` dùng nguyên, còn `select_index`/`q_values` phục vụ huấn luyện và trực quan. Lý do: tránh vỡ `env.scenario`/`env.unwrapped` và giữ cùng đường chạy đánh giá với SAC.
2. **Mạng:** thân chung 2×256 ReLU, sau đó hai đầu tuyến tính: V (→1) và A (→K).
3. Cờ cấu hình `double` và `dueling` (mặc định bật) để kiểm thử đơn vị và chạy ablation sau này; không bắt buộc chạy ablation.
4. `train_ddqn.py` import và kế thừa `TrainingRecorder` (ghi đè các khóa log: `loss`, `q_mean`, `epsilon`), **không sửa `train_sac.py`**.
5. `configs/ddqn.yaml` giữ mục `evaluation` y hệt `configs/sac.yaml`, để fingerprint giao thức trùng khớp.
6. API: `policy_mode="ddqn"` trong `server.py`; mỗi bước timeline trả thêm `q_values` (K), `v_value`, `advantages` (K), `chosen_k`, cùng `action_grid` ở cấp phản hồi. Đường dẫn checkpoint đặt bằng cấu hình/biến môi trường, có mặc định.
7. Giao diện 3D: một panel thanh ngang 11 mức Q tại bước hiện tại, tô mức được chọn, kèm V(s); đặt cạnh các điều khiển mô phỏng sẵn có. Vị trí chính xác do người làm quyết định theo bố cục hiện tại.

## 6. Các giai đoạn (để lập kế hoạch)

1. **Lõi thuật toán** — `sems_rl/agents/ddqn.py` (config, mạng Dueling, buffer, agent) + `tests/test_ddqn.py`.
2. **Huấn luyện** — `configs/ddqn.yaml`, `train_ddqn.py`; chạy thử ngắn (smoke), rồi pilot ~50k bước, sau đó 5 seed × 300k.
3. **Đánh giá** — `evaluate_ddqn.py` (tái dùng `aggregate_results`), so với no-battery, RBC và SAC trên S1–S5; chỉ chạy test khi đã chốt mô hình.
4. **Trực quan** — `dashboard_ddqn.py`; `policy_mode="ddqn"` + `q_values` trong `server.py`; panel Q-values trong 3D (rồi build lại `frontend/dist` nếu repo đang theo dõi bản build).
5. **Mở rộng (không bắt buộc)** — đối chiếu SB3 DQN (chỉ kiểm tra đường ống, vì SB3 DQN không có Double/Dueling); thử K=5 và K=21; ablation double/dueling.
6. **Tài liệu bàn giao** — `docs/DDQN_LY_DINH_SON.md` theo mẫu của tài liệu SAC.

## 7. Kiểm thử (tối thiểu)

- Dueling: trung bình A đã trừ bằng 0, `Q − V` có tổng zero-mean theo hành động.
- Double target: dựng tình huống mạng chính và mạng đích chọn argmax khác nhau; target Double ≠ target DQN thường, và bằng đúng `Q_tg(s', argmax Q_θ(s'))`.
- `terminated=1` loại bỏ phần bootstrap; `truncated` không loại.
- Lịch ε: đúng 1.0 → 0.05 tại 50.000 bước và giữ nguyên sau đó.
- Cập nhật mềm: tham số mạng đích dịch đúng theo τ; mạng đích không nhận gradient.
- `save`/`load` cho ra cùng Q; `predict` trả hành động nằm trong `action_grid`.
- Smoke: vài trăm bước huấn luyện trên môi trường thật, loss hữu hạn, có file `best.pt`, `validation.csv`.

## 8. Tiêu chí hoàn thành

Tất cả test xanh; một lần huấn luyện + đánh giá chạy từ đầu đến cuối và tái lập được (metadata, fingerprint); 3D phát lại một ngày bằng DDQN và hiện Q-values; báo cáo trung thực kết quả dù DDQN thua SAC.

## 9. Để người làm quyết định

Tên khóa log chi tiết, bố cục panel Q trong 3D, định dạng biểu đồ Streamlit, thứ tự các thử nghiệm mở rộng.
