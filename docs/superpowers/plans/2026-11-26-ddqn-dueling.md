# Double DQN + Dueling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Viết DDQN + Dueling bằng PyTorch cho SEMS-RL, huấn luyện/đánh giá theo đúng giao thức của SAC, và trình diễn quyết định thật (kèm Q-values) trên giao diện 3D và dashboard Streamlit.

**Architecture:** `sems_rl/agents/ddqn.py` chứa agent độc lập (giống `sac.py`). Huấn luyện/đánh giá tái dùng hạ tầng `sac_experiment.py`, `TrainingRecorder` và `aggregate_results` mà không sửa các file của SAC. Agent giữ bảng hành động rời rạc, trả hành động **liên tục** qua `predict()`; phần giải thích Q/V/A đi qua `explain()` để `server.py`, 3D và Streamlit dùng chung.

**Tech Stack:** Python ≥3.10, PyTorch, Gymnasium 1.x, PyYAML, FastAPI (`server.py`), Streamlit + Plotly, React/Vite (`frontend/`), `unittest`.

**Spec:** `docs/superpowers/specs/2026-11-26-ddqn-dueling-design.md`

## Global Constraints

- Hyperparameter mặc định (TH2): 2 lớp ẩn 256 ReLU; Adam `1e-4`; Huber (`smooth_l1`); cắt gradient chuẩn `10`; `gamma=0.99`; `tau=0.005` (cập nhật mềm, mỗi lần `update()`); `batch_size=256`; `buffer_size=200_000`; `learning_starts=5_000`; ε `1.0 → 0.05` tuyến tính trong `50_000` bước rồi giữ; `300_000` bước; seed `[0,1,2,3,4]`; `K=11`.
- Hành động: `a = -1 + 2k/(K-1)`, `k=5` là pin nghỉ; lệnh liên tục vẫn đi qua Safety Guardrail. Không đưa chỉ số k vào môi trường.
- Chỉ `terminated` tắt bootstrap; `truncated` thì không.
- **Quy ước bước (thống nhất cho Task 2 và 4):** `step` đếm tổng số bước môi trường từ 1 đến `N_total`. `step <= learning_starts` → hành động ngẫu nhiên hoàn toàn; `update()` chỉ chạy khi `step > learning_starts` **và** `buffer.size >= batch_size`. `epsilon(step)` nhận chính `step` toàn cục này (không trừ `learning_starts`), nên tại `step=5.000` ε ≈ 0.905. Quy ước theo `train_sac.py`, lệch 1 bước so với mã giả TH2 (`step < N_start`); ghi chú điều này trong tài liệu bàn giao.
- **Không sửa:** `sems_rl/envs/*`, `sems_rl/agents/sac.py`, `train_sac.py`, `evaluate_sac.py`, `sems_rl/experiments/sac_experiment.py`, `configs/sac.yaml`.
- Mục `evaluation` của `configs/ddqn.yaml` giống hệt `configs/sac.yaml`; giao thức là `sac-daily-v1`.
- Không dùng tập test để chọn mô hình hay chỉnh tham số. Không tự thay checkpoint thiếu bằng luật cứng.
- Chú thích/docstring/thông báo lỗi bằng tiếng Việt (quy ước repo); tên định danh bằng tiếng Anh.
- Chạy test: `python -m unittest discover -s tests -p "test_ddqn*.py" -v` (từ thư mục gốc repo).

## Review Focus

1. Quan sát sai hình dạng, NaN hoặc vô cực → `predict` báo `ValueError` rõ ràng (Task 2).
2. Checkpoint thiếu hoặc hỏng khi chọn DDQN trên server → lỗi HTTP rõ ràng, không quay về RBC (Task 7).
3. Checkpoint `dueling=False` → `explain` trả `v_value`/`advantages` là `None`, panel 3D không vỡ (Tasks 2, 7, 8).
4. Thư mục kết quả đã có dữ liệu → từ chối ghi đè (Task 4).
5. Chế độ không phải DDQN → timeline không có khóa `ddqn`, giao diện không lỗi (Tasks 7, 8).

---

### Task 1: Cấu hình, bảng hành động và mạng Dueling

**Files:**
- Create: `sems_rl/agents/ddqn.py`
- Create: `tests/test_ddqn.py`

**Interfaces:**
- Produces:
  - `DDQNConfig` (dataclass): `observation_dim=7, num_actions=11, hidden_size=256, learning_rate=1e-4, gamma=0.99, tau=0.005, batch_size=256, buffer_size=200_000, learning_starts=5_000, epsilon_start=1.0, epsilon_end=0.05, epsilon_decay_steps=50_000, grad_clip_norm=10.0, double=True, dueling=True`; `__post_init__` ném `ValueError` khi `num_actions<2`, kích thước/lr không dương, `gamma∉[0,1]`, `tau∉(0,1]`, `batch_size>buffer_size`, `learning_starts<0`, `epsilon_end>epsilon_start` hoặc `epsilon_decay_steps<1`.
  - `build_action_grid(num_actions: int) -> np.ndarray` (float32, `np.linspace(-1, 1, K)`).
  - `DuelingQNetwork(config)`: thuộc tính `trunk` (2×`hidden_size` ReLU), `value_head: nn.Linear | None` (None khi `dueling=False`), `output_head: nn.Linear` (A khi dueling, Q khi không). `forward(obs) -> Tensor (B,K)`; `heads(obs) -> tuple[Tensor (B,1), Tensor (B,K)]` ném `ValueError` khi không dueling.

- [ ] **Step 1: Viết test (thất bại)** trong `tests/test_ddqn.py` (lớp `NetworkTests`):
  - `test_q_equals_value_plus_centered_advantage`: `v, a = net.heads(obs)`; `q = net(obs)`; `assert_close(q, v + a - a.mean(-1, keepdim=True))` và `assert_close(q.mean(-1, keepdim=True), v)` (obs `randn(5, 7)`).
  - `test_plain_head_shape_and_no_heads`: `dueling=False` → `net(obs).shape == (5, 11)`, `net.value_head is None`, `net.heads(obs)` ném `ValueError`.
  - `test_config_rejects_invalid_values`: mỗi giá trị sai trong danh sách trên ném `ValueError`.
  - `test_action_grid_matches_discretize_wrapper`: `build_action_grid(11)` bằng `DiscretizeActionWrapper(make_env(read_settings()), 11).action_grid`; `grid[0] == -1`, `grid[5] == 0`, `grid[-1] == 1`, dtype float32.
- [ ] **Step 2: Chạy và xác nhận thất bại** (`ImportError`).
- [ ] **Step 3: Cài đặt** `DDQNConfig`, `build_action_grid`, `DuelingQNetwork` trong `sems_rl/agents/ddqn.py`. Công thức: `Q = V + A − mean_k A`.
- [ ] **Step 4: Chạy test, mong đợi PASS.**
- [ ] **Step 5: Commit** — `feat(ddqn): add config, action grid and dueling network`

---

### Task 2: Replay buffer, hành động ε-greedy và giải thích Q

**Files:**
- Modify: `sems_rl/agents/ddqn.py`
- Modify: `tests/test_ddqn.py`

**Interfaces:**
- Consumes: `DDQNConfig`, `build_action_grid`, `DuelingQNetwork` (Task 1).
- Produces:
  - `ReplayBuffer(config, seed=0)`: `add(observation, action_index: int, reward, next_observation, terminated)` (vòng, ghi đè cũ nhất); `sample(batch_size, device) -> tuple` gồm `obs (B,7) float32`, `actions (B,1) int64`, `rewards (B,1)`, `next_obs (B,7)`, `terminated (B,1)`; ném `ValueError` khi `size < batch_size`; thuộc tính `size`, `position`.
  - `DDQNAgent(config=None, seed=0, device="cpu")` với `online`, `target` (bản sao, `requires_grad=False`), `action_grid`, `rng = np.random.default_rng(seed)`, `buffer`, `update_count`.
  - `epsilon(step: int) -> float`; `action_value(k: int) -> float`.
  - `select_action_index(observation, epsilon: float = 0.0) -> int`: với xác suất `epsilon` lấy đều trong `{0..K-1}` bằng `self.rng`, ngược lại `argmax` Q (index nhỏ nhất khi hòa).
  - `q_values(observation) -> np.ndarray (K,)`.
  - `explain(observation) -> dict` khóa `q_values: list[float]`, `v_value: float | None`, `advantages: list[float] | None`, `chosen_k: int` (None khi không dueling).
  - `predict(observation, deterministic=True) -> (np.ndarray, None)`: một quan sát → hành động hình `(1,)` float32 thuộc `action_grid`; batch `(n,7)` → `(n,1)`. Kiểm tra hình dạng/hữu hạn giống `SACAgent.predict` (`ValueError`). `deterministic=False` dùng `epsilon_end`.

- [ ] **Step 1: Viết test (thất bại)** (lớp `AgentActingTests`, mạng nhỏ `hidden_size=16, batch_size=8, buffer_size=32`):
  - `test_epsilon_schedule`: `epsilon(0)==1.0`; `epsilon(25_000)≈0.525`; `epsilon(50_000)≈0.05`; `epsilon(10**6)==0.05`.
  - `test_greedy_follows_q_and_full_exploration_covers_all_actions`: đặt toàn bộ tham số về 0, `output_head.bias` làm Q cao nhất tại `k=3` → `select_action_index(obs, 0.0) == 3`; với `epsilon=1.0` trên 300 lần gọi, tập chỉ số thu được là `{0..10}`.
  - `test_predict_returns_grid_action_and_validates_input`: kết quả `(array shape (1,), float32)` và giá trị nằm trong `action_grid`, phần tử thứ hai là `None`; batch `(4,7)` → `(4,1)`; quan sát hình `(6,)`, có `nan`, có `inf` đều ném `ValueError`.
  - `test_explain_matches_network_and_handles_plain_head`: `chosen_k == argmax(q_values)`, `q ≈ v + adv − mean(adv)`, độ dài K; với `dueling=False` thì `v_value is None` và `advantages is None`.
  - `test_buffer_ring_and_sample_shapes`: capacity 4, thêm 6 → `size==4`, `position==2`; `sample(3)` đúng hình/dtype ở trên; `size<batch` ném `ValueError`.
- [ ] **Step 2: Chạy, xác nhận thất bại.**
- [ ] **Step 3: Cài đặt** các thành phần trên. `epsilon(step) = max(eps_end, eps_start − (eps_start − eps_end)·step/decay)`.
- [ ] **Step 4: Chạy test, mong đợi PASS.**
- [ ] **Step 5: Commit** — `feat(ddqn): add replay buffer, epsilon-greedy acting and explain`

---

### Task 3: Mục tiêu Double, cập nhật, cập nhật mềm, lưu/nạp

**Files:**
- Modify: `sems_rl/agents/ddqn.py`
- Modify: `tests/test_ddqn.py`

**Interfaces:**
- Consumes: Task 2.
- Produces:
  - `DDQNAgent.compute_target(rewards, next_observations, terminated) -> Tensor (B,1)`: `double=True` → `k* = argmax online(s')`, `y = r + γ(1−d)·target(s')[k*]`; `double=False` → `max target(s')`. Không có gradient.
  - `DDQNAgent.update() -> dict` khóa `loss, q_mean, td_error_mean` (float): lấy batch, `smooth_l1_loss(Q(s,k), y)`, Adam, `torch.nn.utils.clip_grad_norm_(online.parameters(), config.grad_clip_norm)`, rồi `target ← lerp(online, tau)`; tăng `update_count`; ném `FloatingPointError` nếu có giá trị không hữu hạn.
  - `save(path)` / `classmethod load(path, device="cpu") -> DDQNAgent` (`torch.load(..., weights_only=True)`; lưu config, seed, `online`, `target`, optimizer, `update_count`; không lưu buffer).

- [ ] **Step 1: Viết test (thất bại)** (lớp `AgentLearningTests`):
  - `test_double_target_uses_online_argmax_and_target_values`: tạo bất đồng giữa hai mạng (online ưu tiên `k=2`, target ưu tiên `k=7` bằng cách đặt `output_head.bias`); với `double=True`, `compute_target == r + γ(1−d)·target(s')[:, 2]` và **khác** kết quả `double=False` (`== r + γ(1−d)·target(s').max`).
  - `test_terminated_removes_bootstrap_but_truncation_is_not_an_input`: `terminated=1` → `compute_target == rewards`; `terminated=0` → khác `rewards`.
  - `test_update_changes_online_and_soft_updates_target`: `tau=0.1`; lưu bản sao tham số trước; sau `update()` mỗi tham số target bằng `old_target + 0.1·(new_online − old_target)`; tham số online đổi; khóa trả về hữu hạn; `update_count == 1`.
  - `test_update_clips_gradient_with_configured_norm`: `unittest.mock.patch("torch.nn.utils.clip_grad_norm_")` được gọi với `max_norm=10.0`.
  - `test_update_rejects_small_buffer_and_nonfinite_values`: buffer chưa đủ → `ValueError`; thưởng `nan` → `FloatingPointError`.
  - `test_save_load_roundtrip`: `q_values` giống nhau trước/sau, `update_count` và config được khôi phục (`tempfile`).
- [ ] **Step 2: Chạy, xác nhận thất bại.**
- [ ] **Step 3: Cài đặt** như mô tả; lỗi hồi quy phổ biến: quên `no_grad` ở `compute_target`, quên `.long()` cho chỉ số `gather`.
- [ ] **Step 4: Chạy toàn bộ `tests/test_ddqn.py`, mong đợi PASS.**
- [ ] **Step 5: Commit** — `feat(ddqn): add double target, soft target update and checkpointing`

---

### Task 4: Cấu hình và huấn luyện `train_ddqn.py`

**Files:**
- Create: `configs/ddqn.yaml`
- Create: `train_ddqn.py`
- Create: `tests/test_ddqn_cli.py`

**Interfaces:**
- Consumes: `DDQNAgent`, `DDQNConfig` (Tasks 1–3); `read_settings(path, env_config_path)`, `make_env`, `seed_everything`, `experiment_metadata`, `write_json`, `evaluate_policy` (từ `sac_experiment`); `TrainingRecorder`, `append_csv` (từ `train_sac`).
- Produces: `configs/ddqn.yaml` (mục `agent` = các trường `DDQNConfig`; `training`/`evaluation` như `sac.yaml`, kể cả `log_freq: 1000`, `eval_freq: 10000`, `eval_days: 54`); `DDQNRecorder(TrainingRecorder)` ghi đè `progress(self, step, metrics)` (cùng chữ ký với lớp cha) để `training.csv` có đúng các cột `step, elapsed_seconds, loss, q_mean, td_error_mean, epsilon` theo thứ tự đó; `metrics` do trainer truyền vào là `{**update_metrics, "epsilon": eps}`; khi `metrics` rỗng (lớp cha gọi `progress(step, {})` trong `finish()`) các cột còn lại là `None`, không lỗi; lệnh `python train_ddqn.py [--config --env-config --seeds --steps --learning-starts --eval-freq --eval-days --device --output]` (mặc định `--output runs/ddqn`) tạo `runs/ddqn/ddqn_seed{N}/` với `metadata.json` (backend `"ddqn"`), `validation.csv`, `training.csv`, `best.pt`, `last.pt`, `training_summary.json` (`test_used_for_selection: false`), `learning_curve.png`.

- [ ] **Step 1: Viết test CLI (thất bại)** `CommandLineTests` theo mẫu `tests/test_sac_cli.py` (`run_command` bằng `subprocess`, cấu hình tạm nhỏ: `hidden_size 16, batch_size 8, buffer_size 64, learning_starts 8, epsilon_decay_steps 10`, `total_timesteps 20, eval_freq 10, eval_days 1, log_freq 10, seeds [0]`):
  - `test_train_writes_expected_artifacts`: có đủ các tệp trên; `validation.step == [0, 10, 20]`; `total_timesteps == 20`; `test_used_for_selection is False`; `list(training.columns) == ["step", "elapsed_seconds", "loss", "q_mean", "td_error_mean", "epsilon"]`; dòng đầu của `training.csv` ở `step == 10` có `epsilon ≈ 0.05` (với `epsilon_decay_steps 10`, chứng tỏ `epsilon` nhận bước toàn cục).
  - `test_existing_results_are_not_overwritten`: chạy lại cùng `--output` → returncode ≠ 0 và `best.pt` không đổi byte.
- [ ] **Step 2: Chạy, xác nhận thất bại.**
- [ ] **Step 3: Cài đặt.** Vòng lặp (`step` từ 1 đến `total_timesteps`, theo quy ước bước ở Global Constraints): `k = select_action_index(obs, epsilon=1.0 if step <= learning_starts else agent.epsilon(step))`; gửi `np.array([agent.action_value(k)], np.float32)` vào `env.step`; `buffer.add(obs, k, reward, next_obs, terminated)`; `metrics = agent.update()` khi `step > learning_starts and agent.buffer.size >= config.batch_size`; `recorder.progress(step, {**metrics, "epsilon": agent.epsilon(step)})` mỗi `log_freq` bước (nếu chưa có `metrics` thì chỉ truyền `epsilon`); reset khi `terminated or truncated`. `DDQNRecorder` gọi `super().__init__(..., backend="custom", ...)` để checkpoint có đuôi `.pt`. Kiểm tra `observation_dim` khớp `env.observation_space`. Từ chối thư mục kết quả đã có dữ liệu (như `train_sac.py`). Ghi `asdict(DDQNConfig(**agent))` vào metadata sau mọi ghi đè từ dòng lệnh.
- [ ] **Step 4: Chạy `python -m unittest tests.test_ddqn_cli -v`, mong đợi PASS.**
- [ ] **Step 5: Commit** — `feat(ddqn): add training script and config`

---

### Task 5: Huấn luyện thử (pilot) 50.000 bước

**Files:**
- Create: `docs/ddqn_pilot/` (sao chép `validation.csv`, `training.csv`, `training_summary.json`, `metadata.json`, `learning_curve.png`; checkpoint `.pt` bị `.gitignore`)

- [ ] **Step 1:** `python train_ddqn.py --seeds 0 --steps 50000 --output runs/ddqn_pilot` (đo thời gian chạy để ước lượng 5 seed × 300k).
- [ ] **Step 2: Kiểm tra** `validation.csv` có 6 dòng (bước 0…50.000), mọi `loss`/`q_mean` hữu hạn, `epsilon` giảm từ ~1.0 xuống ~0.05 theo `training.csv`, `best.pt` tồn tại. Nếu chi phí điều chỉnh không cải thiện so với bước 0, **dừng và điều tra** (superpowers:systematic-debugging) trước khi sang Task 6.
- [ ] **Step 3:** Sao chép các tệp nhỏ vào `docs/ddqn_pilot/`; **Commit** — `docs(ddqn): add 50k-step pilot results`

---

### Task 6: Đánh giá `evaluate_ddqn.py`

**Files:**
- Create: `evaluate_ddqn.py`
- Modify: `tests/test_ddqn_cli.py`

**Interfaces:**
- Consumes: `DDQNAgent.load`; `SACAgent.load` (cho `--sac-runs`); `evaluate_policy`, `scenario_days`, `make_env`, `experiment_metadata`, `protocol_fingerprint`, `seed_everything`, `write_json`, `SCENARIOS`, `ROOT`; `aggregate_results`, `save_plots` (từ `evaluate_sac`).
- Produces: `python evaluate_ddqn.py --runs <ddqn run dirs> [--sac-runs <sac custom run dirs>] [--split val|test] [--scenarios ...] [--max-days N] [--data-path P] [--output runs/ddqn/evaluation]` ghi `daily_metrics.csv`, `seed_metrics.csv`, `summary.csv`, `evaluation_metadata.json`, `comparison.png`, `example_day.png`; cột `method ∈ {ddqn, sac, no_battery, rule_based}`. Giữ các kiểm tra của `evaluate_sac.py`: cùng fingerprint, mỗi (method, seed) một lần, thư mục output không được có sẵn dữ liệu, đối chiếu hash CSV.

- [ ] **Step 1: Viết test (thất bại)** `EvaluateTests` thêm vào `tests/test_ddqn_cli.py`: huấn luyện nhỏ DDQN (như Task 4) và SAC custom nhỏ (cấu hình mẫu `tests/test_sac_cli.py`), chạy `evaluate_ddqn.py --runs ddqn_seed0 --sac-runs custom_seed0 --split val --max-days 1`:
  - `set(daily.method) == {"ddqn", "sac", "no_battery", "rule_based"}`; `set(daily.scenario) == {"S1".."S5"}`; `len(daily) == 20`; `daily.final_soc` trong `[0.2−1e-6, 0.9+1e-6]`.
  - chạy lại với `--output` đã có dữ liệu → returncode ≠ 0.
- [ ] **Step 2: Chạy, xác nhận thất bại.**
- [ ] **Step 3: Cài đặt** theo cấu trúc `evaluate_sac.py` (không sửa file đó); mặc định `--split val`; không có chỗ nào mặc định dùng `test`.
- [ ] **Step 4: Chạy test, mong đợi PASS; chạy trên pilot:** `python evaluate_ddqn.py --runs runs/ddqn_pilot/ddqn_seed0 --split val --max-days 5 --output runs/ddqn_pilot/evaluation` và xem `summary.csv`.
- [ ] **Step 5: Commit** — `feat(ddqn): add evaluation script comparing DDQN, SAC and baselines`

---

### Task 7: Server — `policy_mode="ddqn"` kèm Q-values

**Files:**
- Modify: `server.py` (nhánh chọn hành động ~dòng 266–286, bản ghi timeline ~dòng 331–355, phản hồi ~dòng 358–378)
- Create: `tests/test_server_ddqn.py`

**Interfaces:**
- Consumes: `DDQNAgent.load`, `explain`, `action_value`, `action_grid` (Tasks 1–3).
- Produces: hàm `get_ddqn_agent() -> DDQNAgent` trong `server.py` (đường dẫn từ biến môi trường `SEMS_DDQN_CHECKPOINT`, mặc định `runs/ddqn/ddqn_seed0/best.pt`; cache theo `(path, mtime_ns)`; thiếu/hỏng → `HTTPException(404, "Chưa có checkpoint DDQN: ...")`). Khi `policy_mode == "ddqn"`: mỗi `step_record` có khóa `"ddqn": {"q_values", "v_value", "advantages", "chosen_k"}` (làm tròn 4 chữ số) và phản hồi có `"action_grid": list[float]`. Chế độ khác: không có khóa `ddqn`, không có `action_grid`. Thêm `flatten_timeline(timeline: list[dict]) -> pd.DataFrame` (làm phẳng `flows` như hiện nay và `ddqn` thành các cột `ddqn_chosen_k`, `ddqn_v_value`, `ddqn_q_{i}`, `ddqn_adv_{i}`); `/api/export-csv` dùng hàm này để CSV không chứa chuỗi dict. Frontend đã kiểm tra: không component nào duyệt toàn bộ khóa của `step_record` (`DataTableTab` chọn cột tường minh), nên khóa lồng `ddqn` an toàn cho giao diện.

- [ ] **Step 1: Viết test (thất bại)** (gọi thẳng `server.simulate(server.SimulationRequest(...))`; không dùng HTTP client vì repo chưa có `httpx`). Tạo agent nhỏ ngẫu nhiên, lưu vào thư mục tạm, đặt `SEMS_DDQN_CHECKPOINT`:
  - `test_ddqn_mode_returns_q_values_per_step`: `len(timeline) == 96`; mỗi bước `len(q_values) == 11`, `chosen_k == argmax(q_values)`, `len(advantages) == 11`; `len(result["action_grid"]) == 11`; `kpi_metrics` và `policy_mode == "ddqn"` có mặt trong phản hồi.
  - `test_missing_checkpoint_returns_clear_error_without_fallback`: đường dẫn không tồn tại → `HTTPException` với `status_code == 404` và `"DDQN"` trong `detail`.
  - `test_plain_head_checkpoint_has_no_value_stream`: checkpoint `dueling=False` → `v_value is None`, `advantages is None`, `q_values` vẫn đủ 11.
  - `test_other_modes_have_no_ddqn_field`: `policy_mode="rbc"` → không bước nào có khóa `ddqn`, không có `action_grid`.
- `test_csv_export_flattens_ddqn_columns`: `flatten_timeline(timeline)` (xem Interfaces) với chế độ `ddqn` có các cột `ddqn_chosen_k`, `ddqn_v_value`, `ddqn_q_0 … ddqn_q_10`, `ddqn_adv_0 … ddqn_adv_10`, không còn cột kiểu dict `ddqn` hay `flows`; với `rbc` thì không có cột `ddqn_*`.
- [ ] **Step 2: Chạy, xác nhận thất bại.**
- [ ] **Step 3: Cài đặt.** Trong vòng mô phỏng: `info_q = agent.explain(obs)`; `action = np.array([agent.action_value(info_q["chosen_k"])], np.float32)`; giữ danh sách `ddqn_trace` song song `sim_history`. Quan sát nhiễu (S4) vẫn đi thẳng vào agent. Không đổi hành vi các chế độ cũ.
- [ ] **Step 4: Chạy `python -m unittest tests.test_server_ddqn -v` (PASS) và chạy lại `python test_env.py`** để chắc không hỏng môi trường.
- [ ] **Step 5: Commit** — `feat(server): add ddqn policy mode with q-value trace`

---

### Task 8: Giao diện 3D — chọn DDQN và panel Q-values

**Files:**
- Modify: `frontend/src/components/SidebarControls.jsx` (thêm thẻ radio cạnh `rbc`/`nobat`/`custom`, ~dòng 118–152)
- Modify: `frontend/src/App.jsx` (xử lý lỗi non-2xx ~dòng 66–68; truyền `actionGrid`)
- Modify: `frontend/src/components/KpiCards.jsx` (dòng 7 và nhãn chế độ, thêm nhãn DDQN)
- Create: `frontend/src/components/QValuesPanel.jsx`
- Modify: `frontend/src/components/SmartHouseSimulation.jsx` (render panel ngay sau `live-telemetry-row`, ~dòng 347+)
- Modify (build): `frontend/dist/` (được git theo dõi)

**Interfaces:**
- Consumes: JSON của Task 7 (`timeline[i].ddqn`, `action_grid`).
- Produces: `QValuesPanel({ ddqn, actionGrid })` — 11 thanh ngang tương ứng `action_grid` (nhãn `-1.0 … +1.0`, ghi chú xả/nghỉ/sạc), tô nổi `chosen_k`, hiện `V(s)` khi `v_value != null`; `ddqn` hoặc `actionGrid` thiếu → trả `null`.

- [ ] **Step 1:** `policyMode: 'ddqn'` ở thẻ radio nhãn "DDQN + Dueling (AI)". Trong `App.jsx`, khi `!response.ok` đọc `detail` từ JSON (nếu có) và đưa vào `Error`, để thông báo thiếu checkpoint hiển thị cho người dùng.
- [ ] **Step 2:** Viết `QValuesPanel.jsx` theo kiểu `live-card` hiện có; trục thanh dùng min/max của `q_values` tại bước đó.
- [ ] **Step 3:** `cd frontend && npm run lint && npm run build` — không lỗi; `frontend/dist` được cập nhật.
- [ ] **Step 4: Xác nhận bằng chạy thật** (skill `run`): `SEMS_DDQN_CHECKPOINT=<pilot best.pt> python server.py`, mở giao diện, chọn DDQN → kéo thanh thời gian: panel đổi theo bước, `chosen_k` khớp trạng thái Sạc/Xả/Nghỉ của thẻ pin; chọn lại RBC → panel biến mất, không lỗi console; ở chế độ DDQN mở tab bảng dữ liệu và tab biểu đồ (không lỗi render) rồi bấm tải CSV (đúng như trước, không có cột `ddqn`); trỏ `SEMS_DDQN_CHECKPOINT` tới tệp không tồn tại → thông báo lỗi tiếng Việt hiển thị. Chụp ảnh màn hình để đính vào báo cáo.
- [ ] **Step 5: Commit** — `feat(frontend): add DDQN policy and Q-values panel`

---

### Task 9: Dashboard Streamlit `dashboard_ddqn.py`

**Files:**
- Create: `dashboard_ddqn.py`

**Interfaces:**
- Consumes: `DDQNAgent.load`, `explain`; `make_env`, `episode`, `episode_metrics`, `policy_function`, `scenario_days`, `protocol_fingerprint`, `experiment_metadata` (theo mẫu `dashboard_sac.py`).
- Produces: `python -m streamlit run dashboard_ddqn.py --server.address 127.0.0.1` với ba phần: (1) đường cong học từ `validation.csv`/`training.csv` (thưởng, chi phí điều chỉnh, loss, ε); (2) so sánh DDQN với No-battery, RBC (và SAC nếu có run) trên cùng ngày/kịch bản đã chọn; (3) thanh trượt bước → biểu đồ Q(s,k) 11 mức, V(s) và A(s,k) tại bước đó.

- [ ] **Step 1:** Cài đặt theo mẫu `dashboard_sac.py`: khai báo `RUNS`, `load_run` kiểm tra fingerprint (CSV khác dữ liệu lúc train → báo lỗi, không đoán); thiếu run → `st.error` rõ ràng, không thay bằng luật.
- [ ] **Step 2: Kiểm tra bằng `streamlit.testing.v1.AppTest.from_file("dashboard_ddqn.py").run(timeout=120)`** trên run pilot: `not at.exception`, có biểu đồ ở cả ba phần; và khi thiếu run, `at.error` không rỗng.
- [ ] **Step 3: Commit** — `feat(ddqn): add training and q-value dashboard`

---

### Task 10: Huấn luyện chính thức, đánh giá cuối, tài liệu bàn giao

**Files:**
- Create: `docs/DDQN_LY_DINH_SON.md` (theo mẫu `docs/SAC_NGUYEN_VAN_TRUONG.md`: phạm vi/cấu trúc mã, giải thích thuật toán để vấn đáp, cách chạy, kết quả)
- Create: `docs/ddqn_results/` (CSV, biểu đồ, ảnh chụp 3D)
- Modify: `README.md` (thêm liên kết tới tài liệu DDQN, cạnh liên kết SAC)

- [ ] **Step 1:** `python train_ddqn.py --output runs/ddqn` (5 seed × 300.000 bước, mặc định theo `configs/ddqn.yaml`).
- [ ] **Step 2: Đánh giá validation trước,** `python evaluate_ddqn.py --runs runs/ddqn/ddqn_seed{0..4} --sac-runs <SAC custom runs nếu có> --split val --output runs/ddqn/eval_val`; chỉ khi mô hình đã chốt mới chạy `--split test --output runs/ddqn/eval_test` đúng một lần.
- [ ] **Step 3:** Viết `docs/DDQN_LY_DINH_SON.md` gồm kết quả **trung thực** (kể cả khi DDQN thua SAC/RBC) và định lượng thiệt hại do rời rạc hóa; sao chép CSV/biểu đồ nhỏ vào `docs/ddqn_results/`.
- [ ] **Step 4: Chạy toàn bộ test:** `python -m unittest discover -s tests -v` → toàn bộ PASS (kể cả test của SAC).
- [ ] **Step 5: Commit** — `docs(ddqn): add handover doc and final results`

---

### Task 11 (tùy chọn): Mở rộng

Làm sau Task 10, mỗi mục là một lượt chạy độc lập dùng cùng `configs/ddqn.yaml` ghi đè bằng tệp phụ:
- **K=5 và K=21** (`num_actions`), đánh giá bằng `evaluate_ddqn.py` trên validation, so sánh với K=11.
- **Ablation** `double=false` và `dueling=false` (một seed, 100k bước) để tách đóng góp từng thành phần.
- **Đối chiếu SB3 DQN:** chỉ kiểm tra đường ống (SB3 DQN không có Double/Dueling), dùng `DiscretizeActionWrapper` bọc `make_env`; nêu rõ giới hạn này trong báo cáo.
