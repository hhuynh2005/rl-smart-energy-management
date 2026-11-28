# Double DQN + Dueling của Lý Đình Sơn

Tài liệu hướng dẫn đọc mã, chạy thí nghiệm, trình diễn và bàn giao mô hình DDQN cho nhóm SEMS-RL. Sơn cài đặt toàn bộ thuật toán bằng PyTorch, theo Thuật toán 4 trong báo cáo TH2. DDQN là **đối chuẩn khác họ**: nó cho biết việc rời rạc hóa 11 mức làm mất bao nhiêu hiệu quả so với SAC, TD3, PPO điều khiển liên tục.

Thiết kế và kế hoạch: `docs/superpowers/specs/2026-11-26-ddqn-dueling-design.md`, `docs/superpowers/plans/2026-11-26-ddqn-dueling.md`.

## Phạm vi và cấu trúc mã nguồn

| Tệp | Nội dung | Thứ tự đọc |
| --- | --- | --- |
| `sems_rl/agents/ddqn.py` | `DDQNConfig`, bảng hành động, mạng Dueling, replay buffer, `DDQNAgent` | 1 |
| `configs/ddqn.yaml` | Tham số thuật toán, huấn luyện; mục đánh giá giống hệt `configs/sac.yaml` | 2 |
| `train_ddqn.py` | Vòng huấn luyện ε-greedy, chọn mô hình bằng validation | 3 |
| `evaluate_ddqn.py` | Đánh giá S1–S5, so với SAC (nếu có), No-battery, RBC | 4 |
| `dashboard_ddqn.py` | Streamlit: quá trình học, so sánh trong ngày, Q(s,k)/V(s)/A(s,k) | 5 |
| `server.py` (`policy_mode="ddqn"`) | API trả quyết định và Q-values từng bước cho giao diện | 6 |
| `frontend/public/campus.html`, `QValuesPanel.jsx` | Nút "DDQN" trong 3D và panel 11 thanh Q | 7 |
| `tests/test_ddqn*.py`, `tests/test_server_ddqn.py` | Kiểm thử thuật toán, lệnh chạy, dashboard và API | 8 |

Môi trường, hàm thưởng và mã SAC giữ nguyên. DDQN dùng lại `SACScenarioWrapper`, `evaluate_policy` và `TrainingRecorder` để so sánh cùng điều kiện với SAC.

## Giải thích thuật toán để vấn đáp

### Hành động rời rạc

`a = −1 + 2k/(K−1)`, `k ∈ {0,…,10}`: k=0 xả tối đa, k=5 pin nghỉ, k=10 sạc tối đa (bước 10% công suất 50 kW). Agent giữ bảng `action_grid` (cùng công thức với `DiscretizeActionWrapper`, có test đối chiếu). Buffer lưu **chỉ số k**; môi trường luôn nhận **lệnh liên tục** `[a]` và vẫn đi qua Safety Guardrail. Vì vậy `predict()` trả hành động liên tục giống SAC, và mọi hàm đánh giá dùng chung được.

### Mạng Dueling

Thân chung 2 lớp ẩn 256 ReLU, rồi hai đầu tuyến tính: V(s) (1 giá trị) và A(s,k) (11 giá trị).

`Q(s,k) = V(s) + A(s,k) − mean_k A(s,k)`

Phải trừ trung bình A, vì nếu không thì V và A không xác định duy nhất: cộng hằng số vào V và trừ ở A cho cùng Q. Khi nhiều mức công suất có giá trị gần nhau (ví dụ giờ bình thường), Dueling học V(s) chung nên hội tụ nhanh hơn. Cờ `dueling: false` cho đầu Q thường để chạy ablation.

### Double DQN

Đích DQN thường `y = r + γ·max_k Q_tg(s',k)` đánh giá quá cao, vì cùng một mạng vừa chọn vừa đánh giá hành động nhiễu. Double DQN tách hai việc:

`k* = argmax_k Q_θ(s',k)` (mạng chính chọn), `y = r + γ(1−d)·Q_tg(s',k*)` (mạng đích đánh giá).

Test `test_double_target_uses_online_argmax_and_target_values` dựng tình huống hai mạng bất đồng và chứng minh hai cách tính cho kết quả khác nhau.

### Một lần cập nhật

1. Lấy batch 256 từ buffer 200.000.
2. Huber loss (`smooth_l1`) giữa Q_θ(s,k) và y: ít nhạy với sai số TD lớn hơn MSE.
3. Adam lr 1e-4, cắt gradient theo chuẩn 10.
4. Cập nhật mềm `θ_tg ← τ·θ + (1−τ)·θ_tg` với τ=0.005 sau mỗi lần update (theo mã giả TH2, không dùng sao chép cứng mỗi C bước như DQN Nature 2015).

### Khám phá và quy ước bước

`step` đếm bước môi trường từ 1. `step ≤ 5.000` thì chọn ngẫu nhiên hoàn toàn; sau đó ε-greedy với `ε(step) = max(0.05, 1 − 0.95·step/50.000)`, tính theo bước **toàn cục**. `update()` chạy khi `step > 5.000` và buffer đủ một batch. Quy ước này theo `train_sac.py`; mã giả TH2 ghi `step < N_start`, lệch 1 bước, không ảnh hưởng kết quả.

Chỉ `terminated` tắt bootstrap. Cuối ngày (`truncated`) wrapper nối sang 00:00 ngày kế tiếp với SoC giữ nguyên, giống SAC.

## Cài đặt và chạy

```bash
pip install -r requirements.txt
python -m unittest discover -s tests -p "test_ddqn*.py" -v      # thuật toán, lệnh chạy, dashboard
python -m unittest tests.test_server_ddqn -v                     # API

python train_ddqn.py --seeds 0 --steps 50000 --output runs/ddqn_pilot   # chạy thử
python train_ddqn.py --output runs/ddqn                                  # chính thức: 5 seed × 300k
python evaluate_ddqn.py --runs runs/ddqn/ddqn_seed0 runs/ddqn/ddqn_seed1 \
    --sac-runs runs/sac/custom_seed0 --split val --output runs/ddqn/eval_val
python -m streamlit run dashboard_ddqn.py --server.address 127.0.0.1
```

`train_ddqn.py` và `evaluate_ddqn.py` từ chối ghi vào thư mục đã có kết quả. Mô hình tốt nhất (`best.pt`) được chọn bằng `adjusted_total_cost_vnd_mean` trên validation; test chỉ chạy một lần, khi đã chốt mô hình.

### Trình diễn 3D

```bash
# Mặc định server dùng runs/ddqn/ddqn_seed0/best.pt; đổi bằng biến môi trường:
SEMS_DDQN_CHECKPOINT=runs/ddqn/ddqn_seed0/best.pt python server.py 8080
```

- **Tab 3D (khuôn viên Thủy Lợi):** bấm nút **DDQN** trong khung SEMS-RL. Trang gọi `/api/simulate` với `policy_mode="ddqn"` (kịch bản S1), phát lại công suất pin thật mà agent đã thực hiện, và hiện 11 thanh Q(s,k) cùng V(s) tại giờ đang xem. Thanh đậm là mức được chọn (argmax Q). Đổi SoC ban đầu sẽ chạy lại agent.
- **Tab dashboard:** chọn "DDQN + Dueling (AI)" ở thanh bên; panel Q-values hiện trên biểu đồ, theo bước đang chọn.
- Thiếu checkpoint thì giao diện báo lỗi rõ ràng, không âm thầm thay bằng luật cứng.
- Trang 3D quy ước công suất dương là **xả**, môi trường quy ước dương là **sạc**. Khi phát lại, trang đã đổi dấu (đồng thời sửa lỗi dấu có sẵn của nút "Đồng bộ API").

## Kết quả

Cấu hình chính thức theo TH2: 300.000 bước, K=11, **3 seed (0, 1, 2)**. Báo cáo TH2 dự kiến 5 seed; lần chạy 5 seed bị dừng ở khoảng 110.000 bước vì quá lâu, nên đồ án dùng 3 seed (lần chạy dở lưu ở `runs/ddqn_partial_110k`, không dùng cho kết quả). Mỗi seed chạy khoảng 39 phút trên CPU, 1 luồng. Mô hình của từng seed là `best.pt`, chọn bằng chi phí điều chỉnh trên **validation** (bước tốt nhất: 210.000, 270.000, 240.000). Tập test chỉ chạy **một lần** sau khi cách chọn đã cố định. Độ lệch chuẩn (±) là giữa 3 seed, trung bình trên mọi ngày của phân vùng.

Chỉ số: **tổng chi phí điều chỉnh** (tiền điện + hao mòn + phạt + giá trị điện còn trong pin cuối ngày), đơn vị đ/ngày, càng thấp càng tốt. DDQN so với RBC dương nghĩa là DDQN rẻ hơn.

**Tập validation (54 ngày)**

| Kịch bản | DDQN (đ/ngày) | Luật (RBC) | Không pin | DDQN so với RBC | DDQN so với không pin | Đỉnh mua DDQN (kW) |
|---|---|---|---|---|---|---|
| S1 | 843.699 ± 1.865 | 916.618 | 930.176 | +8.0% | +9.3% | 46.9 |
| S2 | 480.966 ± 16.981 | 467.262 | 465.935 | -2.9% | -3.2% | 42.2 |
| S3 | 1.514.695 ± 11.742 | 1.507.194 | 1.525.686 | -0.5% | +0.7% | 76.6 |
| S4 | 808.761 ± 7.488 | 877.651 | 861.399 | +7.8% | +6.1% | 50.8 |
| S5 | 789.961 ± 3.582 | 850.047 | 861.399 | +7.1% | +8.3% | 46.2 |

**Tập test (56 ngày)**

| Kịch bản | DDQN (đ/ngày) | Luật (RBC) | Không pin | DDQN so với RBC | DDQN so với không pin | Đỉnh mua DDQN (kW) |
|---|---|---|---|---|---|---|
| S1 | 669.217 ± 3.575 | 749.912 | 749.529 | +10.8% | +10.7% | 41.4 |
| S2 | 375.596 ± 18.712 | 358.623 | 357.278 | -4.7% | -5.1% | 37.9 |
| S3 | 1.287.483 ± 13.979 | 1.311.052 | 1.294.776 | +1.8% | +0.6% | 71.3 |
| S4 | 644.001 ± 2.298 | 709.425 | 693.493 | +9.2% | +7.1% | 45.2 |
| S5 | 627.271 ± 490 | 694.014 | 693.493 | +9.6% | +9.5% | 40.9 |

Nhận xét:

- DDQN **thắng cả luật và không pin** ở S1, S4, S5 (ngày làm việc, nhiễu quan sát, ngày bất kỳ), tiết kiệm khoảng 7–11% tổng chi phí so với RBC trên cả validation lẫn test. Kết quả ổn định giữa 3 seed (± dưới 1% ở S1).
- DDQN **thua ở S2 (chủ nhật)** trên cả hai tập: tổng chi phí cao hơn không pin 3–5%. Giả thuyết (chưa kiểm chứng): chủ nhật tải thấp và không có cao điểm nên pin có ít việc, trong khi tập huấn luyện chủ yếu là ngày làm việc, nên chính sách vẫn sạc/xả và trả hao mòn. Cần xem chi tiết hành động trong ngày chủ nhật để xác nhận. Độ phân tán giữa seed ở S2 lớn nhất (±17.000 đ).
- **S3 (PV giảm 50%)** gần hòa: DDQN hơn RBC 1,8% trên test nhưng kém 0,5% trên validation, và đỉnh mua lưới của DDQN (71–77 kW) cao hơn không pin (khoảng 60 kW). Chính sách chưa thích nghi tốt khi PV bất ngờ giảm.
- Cột "tiết kiệm tiền điện điều chỉnh" trong `summary_*.csv` chỉ tính tiền điện, không tính hao mòn, nên ở S2 trông dương (15–18%) trong khi tổng chi phí lại tăng. Khi so sánh cần dùng tổng chi phí điều chỉnh như bảng trên.
- Chưa so với SAC: không có checkpoint SAC cùng giao thức trên máy này. `evaluate_ddqn.py --sac-runs` sẵn sàng khi có.

Tệp: `docs/ddqn_results/` (`summary_val.csv`, `summary_test.csv`, `comparison_*.png`, `example_day_test.png`, đường cong học `learning_curve_seed*.png`, `validation_seed*.csv`).

### Pilot 50.000 bước (seed 0)

Dữ liệu ở `docs/ddqn_pilot/`. Chạy hết 198 giây trên CPU. Chi phí điều chỉnh trên validation giảm từ 904.006 đ (bước 0) xuống 814.133 đ (bước 50.000). Loss hữu hạn, ε giảm từ 0,98 về 0,05.

## Giới hạn và điều cần biết khi so sánh

- Dữ liệu là chuỗi tổng hợp của nhóm, không phải số đo thực tế.
- `daily_cost_j` (tiền điện gốc) có lợi cho chính sách xả cạn pin cuối ngày; luôn so bằng `adjusted_*`, là chỉ số đã tính giá trị điện còn trong pin.
- 11 mức là giới hạn cứng: không chọn được công suất giữa hai mức. Đây chính là thiệt hại do rời rạc hóa mà đồ án muốn đo.
- Server chỉ chạy một ngày S1 của tập test để minh họa; số trên giao diện không thay thế bảng đánh giá.

## Câu hỏi thường gặp khi vấn đáp

- **Vì sao DDQN chứ không phải DQN?** DQN dùng max trên Q nhiễu nên đánh giá quá cao; Double tách chọn và đánh giá.
- **Vì sao trừ mean A, không trừ max A?** Cả hai đều làm V, A xác định; trừ trung bình ổn định hơn khi học (Wang và cộng sự), và là lựa chọn trong mã giả TH2.
- **Vì sao cập nhật mềm?** Cùng cơ chế với SAC/TD3 để so sánh công bằng; mục tiêu thay đổi mượt hơn sao chép cứng.
- **Agent có vi phạm SoC không?** Không: mọi lệnh đi qua Safety Guardrail; số bước bị cắt được báo trong `clipped_steps`.

## Tài liệu tham khảo

- H. van Hasselt, A. Guez, D. Silver. *Deep Reinforcement Learning with Double Q-learning*. arXiv:1509.06461, 2015 (AAAI 2016).
- Z. Wang et al. *Dueling Network Architectures for Deep Reinforcement Learning*. arXiv:1511.06581, 2015 (ICML 2016).
- V. Mnih et al. *Human-level control through deep reinforcement learning*. Nature 518, 2015.
