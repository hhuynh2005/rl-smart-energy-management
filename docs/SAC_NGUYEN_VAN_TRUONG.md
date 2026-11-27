# SAC của Nguyễn Văn Trường

Tài liệu hướng dẫn đọc mã nguồn, chạy thí nghiệm và bàn giao mô hình SAC cho nhóm SEMS-RL. Trường phụ trách thuật toán SAC tự viết bằng PyTorch; Huỳnh phối hợp về hàm thưởng; Sơn phụ trách môi trường; Dương phụ trách đánh giá tổng hợp. Bản SAC của Stable-Baselines3 (SB3) dùng làm tham chiếu kiểm tra.

Quy trình Google Colab mới, phân tích S2/S3 và cách thử mục tiêu có định giá pin được trình bày tại [SAC trên Colab](SAC_COLAB_NGUYEN_VAN_TRUONG.md). Các quy ước mô tả dưới đây là cấu hình `original`; cấu hình `daily_inventory` dùng gamma=1 và kết thúc thật sau một ngày.

Kết quả kiểm tra và hai lượt huấn luyện 50.000 bước được ghi trong [báo cáo chạy thử SAC](BAO_CAO_SAC_CHAY_THU.md), kèm CSV và biểu đồ có thể đưa vào báo cáo nhóm.

## Phạm vi và cấu trúc mã nguồn

SAC nhận quan sát 7 chiều và trả một hành động liên tục trong [-1, 1]. Hành động dương là sạc, âm là xả, 0 là nghỉ. Không chuyển hành động sang kW trong agent: môi trường đã thực hiện bước đó và chiếu lệnh qua Safety Guardrail.

| Tệp | Nội dung | Thứ tự đọc |
| --- | --- | --- |
| `sems_rl/agents/sac.py` | Cấu hình, Actor, Critic, replay buffer và SACAgent | 1 |
| `configs/sac.yaml` | Tham số thuật toán, huấn luyện và đánh giá | 2 |
| `sems_rl/experiments/sac_experiment.py` | Wrapper, kịch bản, phép đo và quy ước so sánh | 3 |
| `train_sac.py` | Vòng huấn luyện bản tự viết và bản SB3 | 4 |
| `evaluate_sac.py` | Đánh giá mô hình đã chọn và xuất bảng/biểu đồ | 5 |
| `tests/test_sac.py` | Các kiểm thử thuật toán và phép đo | 6 |

Các điều chỉnh thí nghiệm nằm trong `SACScenarioWrapper`. Môi trường gốc, CSV, bộ lọc an toàn và giao diện hiện tại của nhóm giữ nguyên. Khi so sánh với TD3, PPO và DDQN, Dương cần áp dụng cùng wrapper/quy ước cho tất cả phương pháp.

## Giải thích thuật toán SAC

### Actor và cách lấy hành động

Actor dùng hai lớp ẩn, mỗi lớp 256 nút với ReLU. Đầu ra gồm trung bình mu và log độ lệch chuẩn của Gaussian. Khi huấn luyện, lấy mẫu `u = mu + std * noise`, rồi dùng `a = tanh(u)` để đưa hành động về [-1, 1]. `rsample()` cho phép gradient đi qua hành động về tham số Actor.

Tanh làm thay đổi mật độ xác suất, nên log xác suất Gaussian phải được hiệu chỉnh bằng Jacobian của tanh. Nếu bỏ hiệu chỉnh, thành phần entropy của SAC sẽ sai. Mã dùng công thức ổn định số học để tránh log(0) khi tanh gần -1 hoặc 1.

Khi đánh giá, hành động là `tanh(mu)`. Đây là quy tắc đánh giá tất định; không gọi nó là kỳ vọng chính xác của tanh(Gaussian).

### Hai Critic và hai mạng đích

Mỗi Critic nhận 7 giá trị trạng thái cộng 1 hành động và trả một Q(s, a). Q ước lượng tổng phần thưởng có chiết khấu trong tương lai nếu thực hiện hành động đó. Hai mạng độc lập giúp giảm ảnh hưởng của ước lượng Q quá cao bằng cách lấy giá trị nhỏ hơn.

Hai mạng đích là bản sao cập nhật chậm của hai Critic. Phiên bản SAC này không có mạng V riêng và không có Actor đích.

### Replay buffer

Buffer lưu `(s, a, r, s_next, terminated)`. Mỗi lần cập nhật lấy ngẫu nhiên một batch trải nghiệm đã thu thập, vì vậy SAC là off-policy. Khi đầy, buffer ghi đè trải nghiệm cũ nhất.

`a` là lệnh agent gửi vào môi trường, không phải công suất pin sau khi bộ lọc cắt. Môi trường đã định nghĩa phần thưởng và chuyển trạng thái ứng với lệnh này. Công suất thực tế được lưu trong `info` để phân tích.

### Một lần cập nhật SAC

1. Lấy batch từ replay buffer.
2. Tạo mục tiêu Critic:

   `y = r + gamma * (1 - terminated) * [min(Q1_target(s_next, a_next), Q2_target(s_next, a_next)) - alpha * log_pi(a_next | s_next)]`.

3. Cập nhật hai Critic để giảm sai số bình phương giữa Q(s, a) và y.
4. Cập nhật Actor để giảm `mean(alpha * log_pi(a | s) - min(Q1, Q2))`.
5. Cập nhật log(alpha) theo entropy mục tiêu -1; alpha luôn dương vì bằng exp(log_alpha).
6. Cập nhật mềm từng mạng đích: `target = (1 - tau) * target + tau * critic`.

Khi cập nhật Actor, cố định tham số Critic nhưng vẫn truyền gradient qua Q theo hành động. Khi tính mục tiêu y, không truyền gradient về mạng đích. Khi cập nhật alpha, tách gradient của log xác suất khỏi Actor.

Loss không bắt buộc giảm đều vì mục tiêu học thay đổi theo thời gian. Cần xem cả đường cong validation và hành vi pin; một giá trị loss thấp không tự chứng minh điều khiển tốt.

## Cài đặt và chạy

Các lệnh dưới đây chạy tại thư mục gốc repository. Đã thiết kế cho Python 3.10 trở lên; môi trường kiểm tra của phần SAC dùng Python 3.13 và CPU. Phiên bản thư viện thực dùng nằm trong `metadata.json` của từng lần chạy.

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install torch --index-url https://download.pytorch.org/whl/cpu
.\.venv\Scripts\python.exe -m pip install -r requirements-sac.txt
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
.\.venv\Scripts\python.exe test_env.py
```

Chạy nhanh để kiểm tra toàn bộ luồng, chưa dùng để kết luận chất lượng học:

```powershell
.\.venv\Scripts\python.exe train_sac.py --backend custom --seeds 0 --steps 600 --learning-starts 256 --eval-freq 300 --eval-days 2 --output runs/sac_smoke
.\.venv\Scripts\python.exe train_sac.py --backend sb3 --seeds 0 --steps 600 --learning-starts 256 --eval-freq 300 --eval-days 2 --output runs/sac_smoke
.\.venv\Scripts\python.exe evaluate_sac.py --runs runs/sac_smoke/custom_seed0 runs/sac_smoke/sb3_seed0 --split val --max-days 2 --output runs/sac_smoke/evaluation
```

Chạy thử dài hơn, một seed, đánh giá toàn bộ 54 ngày validation:

```powershell
.\.venv\Scripts\python.exe train_sac.py --backend custom --seeds 0 --steps 50000 --output runs/sac_pilot
.\.venv\Scripts\python.exe train_sac.py --backend sb3 --seeds 0 --steps 50000 --output runs/sac_pilot
.\.venv\Scripts\python.exe evaluate_sac.py --runs runs/sac_pilot/custom_seed0 runs/sac_pilot/sb3_seed0 --split val --output runs/sac_pilot/evaluation
```

Mặc định thực nghiệm chính thức là 300.000 bước với seed 0–4. Giữ nguyên cấu hình khi so sánh hai bản:

```powershell
.\.venv\Scripts\python.exe train_sac.py --backend custom --output runs/sac_final
.\.venv\Scripts\python.exe train_sac.py --backend sb3 --output runs/sac_final
```

Sau khi chốt cấu hình, đánh giá trên test. Liệt kê đủ các thư mục seed muốn tổng hợp:

```powershell
.\.venv\Scripts\python.exe evaluate_sac.py --runs runs/sac_final/custom_seed0 runs/sac_final/custom_seed1 runs/sac_final/custom_seed2 runs/sac_final/custom_seed3 runs/sac_final/custom_seed4 --split test --output runs/sac_final/test_custom
```

Không dùng test để thay trọng số hoặc chọn checkpoint. Đánh giá mặc định dùng validation. Thư mục đã có kết quả sẽ bị từ chối ghi đè; dùng tên `--output` mới cho thí nghiệm mới.

Tham số `--env-config` cho phép dùng một YAML môi trường khác khi làm thí nghiệm có kiểm soát. Tham số `--config` chọn cấu hình SAC khác. Các tham số thực dùng sau ghi đè dòng lệnh được lưu trong metadata. Có thể xem TensorBoard bằng `.venv\Scripts\tensorboard.exe --logdir runs`.

## Cách đọc kết quả

Để trực tiếp kiểm chứng mô hình đã lưu, mở màn hình riêng cho SAC:

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements-sac-ui.txt
.\.venv\Scripts\python.exe -m streamlit run dashboard_sac.py --server.address 127.0.0.1 --server.port 8501
```

Truy cập `http://127.0.0.1:8501`. Giao diện tự tìm các thư mục thí nghiệm trong `runs/` có `configuration_lock.json` và `final/custom_seedN/metadata.json`. Chọn đúng thư mục ở thanh bên trái; có thể nhập đường dẫn đến một bản kết quả khác. Giao diện dùng checkpoint `best.pt` của seed đang chọn để suy luận trên CPU, không huấn luyện lại hoặc thay đổi trọng số.

Thư mục `runs/sac_colab_20261128` trên máy Trường là bản nhập từ notebook `1TgwK1dMXlrgfsZvICkgGDKMDDxPCEtxt` và thư mục Drive đã chia sẻ. Có 5 seed chính thức, mỗi seed 300.000 bước, cấu hình `daily_inventory`, thiết bị huấn luyện CPU. `import_manifest.json` ghi nguồn và SHA-256 của từng file đã nhập. Checkpoint và CSV nằm trong `runs/`, được Git bỏ qua; người khác clone mã nguồn cần tải/sao chép riêng thư mục kết quả này.

Màn hình gồm năm phần:

1. **Tổng quan:** chi phí S5, độ lệch chuẩn giữa seed, ngân sách đã chạy và bước checkpoint tốt nhất của từng seed.
2. **Log huấn luyện:** reward/chi phí validation theo bước, dấu sao tại checkpoint được chọn, cùng loss, alpha, Q từ `training.csv`; tải CSV và console gốc.
3. **Đánh giá S1–S5:** đối chiếu SAC, No-battery, Rule-based trên cùng tập ngày; đọc tiền điện gốc, tổng chi phí, hao mòn và số lệnh bị cắt.
4. **Hành vi sạc/xả:** chọn seed, ngày, kịch bản và SoC đầu; chạy 96 quyết định của checkpoint thật. Cả ba phương pháp dùng cùng điều kiện. Đồ thị SoC thêm mốc đầu ngày và đặt SoC sau hành động tại cuối khoảng 15 phút tương ứng.
5. **Nguồn & cách chạy:** đối chiếu hash dữ liệu/cấu hình/checkpoint, xem cấu hình và tải báo cáo HTML tương tác.

Khi so sánh hai lượt CPU/GPU, giữ nguyên ngày, kịch bản, SoC đầu, cấu hình và tập đánh giá. Không xếp hạng mô hình chỉ bằng hình SoC của hai ngày khác nhau. Tiết kiệm tổng chi phí trong giao diện được tính từ `adjusted_total_cost_vnd_mean`, khác với trung bình phần trăm tiết kiệm tiền điện từng ngày `adjusted_cost_saving_pct_mean`.

Tổng hợp lại CSV và báo cáo HTML mà không huấn luyện lại:

```powershell
.\.venv\Scripts\python.exe -m scripts.summarize_sac_results --experiment runs/sac_colab_20261128
```

Các đầu ra nằm ở `analysis/`: `seed_summary.csv`, `training_all_seeds.csv`, `validation_all_seeds.csv`, `evaluation_comparison.csv`, `integrity.csv`, `bao_cao_sac.html` và `colab_console.log`. Console trong notebook bắt đầu khi seed 0 tiếp tục từ 190.000 bước; CSV gốc và `training_summary.json` chứa lịch sử/thời gian đầy đủ, không suy ra tổng thời gian từ một phiên console.

Notebook nguồn chạy `STAGE='final'` nên có validation, chưa chạy test. Bản kiểm chứng cục bộ đã đánh giá test từ đúng năm checkpoint sau khi xác nhận ngân sách/cấu hình, khóa hash mô hình và chạy lại validation khớp dưới 0,01 đồng/ngày về tổng chi phí điều chỉnh. Kết quả test nằm riêng ở `final_test/`; `evaluation_origin.json` ghi nguồn đánh giá cục bộ. Validation gốc từ Drive được giữ nguyên. Giao diện luôn ghi rõ phân vùng đang xem; khi thiếu test, nó không lấy validation để thay thế.

Lệnh đánh giá checkpoint đã khóa (dùng kết quả sẵn có nếu đã hoàn tất):

```powershell
.\.venv\Scripts\python.exe -m scripts.evaluate_locked_sac --experiment runs/sac_colab_20261128 --split test
```

Chỉ đánh giá test sau khi đã đủ ngân sách và khóa mô hình; không chọn lại cấu hình/checkpoint dựa trên test. Bộ đánh giá giữ các điều kiện này bằng `colab_sac.evaluate_final()`.

Mỗi lần chạy nằm trong thư mục `backend_seedN`, gồm:

- `metadata.json`: cấu hình, seed, hash SHA-256 của CSV và phiên bản thư viện.
- `best.pt` hoặc `best.zip`: mô hình có chi phí tổng hợp điều chỉnh trung bình trên validation thấp nhất.
- `last.pt` hoặc `last.zip`: mô hình ở cuối ngân sách huấn luyện, có thể khác mô hình tốt nhất.
- `validation.csv`, `best_validation_days.csv`: quá trình chọn mô hình và chi tiết các ngày tại checkpoint tốt nhất.
- `training.csv`, `tensorboard/`: loss, alpha, Q của bản tự viết và các log SB3 có cung cấp.
- `training_summary.json`, `learning_curve.png`: thông tin tổng hợp và đồ thị.

Quá trình đánh giá tạo `daily_metrics.csv`, `seed_metrics.csv`, `summary.csv`, `evaluation_metadata.json`, `comparison.png`, `example_day.png` và CSV của ngày minh họa từng mô hình/kịch bản.

`daily_metrics.csv` chứa từng ngày. `seed_metrics.csv` lấy trung bình các ngày trong từng seed. `summary.csv` lấy trung bình và độ lệch chuẩn mẫu giữa các seed. Với một seed, cột độ lệch chuẩn ghi 0 và `seed_count=1`: chưa đo được độ ổn định giữa các lượt huấn luyện. Độ lệch chuẩn giữa ngày ở `validation.csv` là một khái niệm khác.

Các thư mục `runs/`, checkpoint và log đã nằm trong `.gitignore`. Cần sao chép mô hình và metadata khi bàn giao; chúng không tự đi theo một lần push mã nguồn.

## Quy ước cần Dương áp dụng

### Quan sát cuối ngày và biên dữ liệu

Môi trường gốc tạo quan sát biên bằng tải cuối ngày, PV=0 và giờ 00:00. Nếu dùng trạng thái này để bootstrap, Q sẽ học từ một tổ hợp thông tin không phải dữ liệu thực của ngày kế tiếp.

Wrapper thay quan sát tại bước 96 bằng tải/PV/giá/cờ ngày 00:00 kế tiếp trong cùng phân vùng, giữ nguyên SoC vừa cập nhật. Vẫn trả `truncated=True`, `terminated=False` và vẫn reset episode cho vòng thu thập dữ liệu. Buffer phải lưu quan sát cuối này trước khi reset.

Riêng ngày cuối phân vùng, không lấy tương lai sang tập khác. Wrapper coi đây là biên dữ liệu với `terminated=True`, `truncated=False`, vì không có dữ liệu tiếp tục hợp lệ trong phân vùng. Đây là giả định tại biên dữ liệu, không phải pin hỏng hay một trạng thái hấp thụ vật lý. Cách này vẫn là xấp xỉ khi học từ các ngày độc lập với SoC khởi tạo ngẫu nhiên.

### So sánh cùng điều kiện và cùng ngày

Mọi phương pháp bắt đầu ở SoC=0,5, dùng cùng ngày, cùng điều kiện vật lý và cùng seed nhiễu theo ngày. Seed nhiễu được cố định độc lập với seed khởi tạo mạng, để sự khác biệt giữa seed mô hình không bị lẫn với thay đổi thời tiết/quan sát.

Cùng seed không có nghĩa bản tự viết và SB3 sẽ có cùng trọng số ban đầu hoặc cùng các batch học. Hai cách tổ chức mạng và nguồn lấy mẫu có thể khác nhau. Việc đối chiếu dựa trên định nghĩa thuật toán, điều kiện thí nghiệm và kết quả; không yêu cầu loss khớp từng bước.

Mỗi ngày được so với No-battery của chính ngày đó. Không dùng tiền điện của một ngày so với tiền điện trung bình cả tập. Khi báo cáo tổng tiền tiết kiệm trên cả tập, tính từ tổng tiền của hai phương pháp; cột phần trăm trung bình trong bảng hiện là trung bình phần trăm tiết kiệm từng ngày.

Rule-based nhận dữ liệu tại đúng bước hiện tại. `info` trả về từ bước trước mô tả thời điểm trước, nên không truyền thẳng nó để quyết định bước kế tiếp. Trong S4, Rule-based cũng dùng tải/PV suy ra từ quan sát nhiễu như agent.

### Lượng điện còn lại trong pin

Pin cuối ngày có thể khác pin đầu ngày. Giữ KPI hóa đơn gốc `daily_cost_j` và thêm khoản định giá tồn kho:

`inventory_adjustment_vnd = (SoC_initial - SoC_final) * E_cap * eta_d * reference_price`.

Giá tham chiếu là trung bình giá mua điện của TRAIN, dùng chung cho mọi phương pháp. Xả bớt điện có sẵn thì cộng chi phí; tích thêm điện thì trừ giá trị tồn kho. Đây là cách định giá quy ước, không phải khoản tiền điện thực tế đã thanh toán, cũng không thay thế kiểm nghiệm độ nhạy hoặc điều kiện SoC cuối bằng SoC đầu.

- `adjusted_electric_cost_vnd`: hóa đơn gốc cộng khoản điều chỉnh tồn kho.
- `total_cost_vnd`: tổng chi phí trong hàm thưởng, gồm tiền điện, hao mòn và các phạt có trọng số.
- `adjusted_total_cost_vnd`: tổng trên cộng khoản điều chỉnh tồn kho; dùng để chọn checkpoint trên validation.
- `cost_saving_pct`: tiết kiệm hóa đơn gốc từng ngày.
- `adjusted_cost_saving_pct`: tiết kiệm sau điều chỉnh tồn kho từng ngày.

Ở cấu hình `original`, hàm thưởng huấn luyện giữ nguyên theo môi trường. Vì vậy tiêu chí chọn checkpoint có thêm điều chỉnh tồn kho so với mục tiêu thưởng gốc; phải nêu điều này khi trình bày kết quả. Cấu hình thử `daily_inventory` bổ sung khoản định giá vào reward từng bước, dùng gamma=1 và terminal cuối ngày để tổng reward khớp tiêu chí chi phí ngày. Dương cần báo cáo đúng cấu hình được chọn và cả hai góc nhìn chi phí, không gọi chi phí điều chỉnh là hóa đơn EVN.

### Kịch bản thử nghiệm

| Kịch bản | Cách thực hiện trong công cụ SAC |
| --- | --- |
| S1 | Các ngày có `is_weekday=1`, gồm thứ Hai đến thứ Bảy theo dữ liệu |
| S2 | Các ngày có `is_weekday=0`, tương ứng chủ nhật |
| S3 | Giảm toàn bộ công suất PV của mỗi ngày còn 50%, tác động thật vào cân bằng công suất |
| S4 | Nhiễu Gaussian vào quan sát tải 8% và PV 15%; tải/PV vật lý giữ nguyên |
| S5 | Tất cả ngày của phân vùng, giữ nguyên dữ liệu; trên test dùng để kiểm tra giai đoạn thời gian khác |

S3 của công cụ SAC khác cách chọn một ngày cố định trong API hiện tại. S4 đánh giá sai số quan sát, không đủ để khẳng định chịu được biến động vật lý hay sai số dự báo tương lai. S5 trên validation phục vụ kiểm tra; kết quả tổng quát hóa cuối cùng cần lấy trên test. Dương cần ghi đúng ý nghĩa này khi tổng hợp.

### Giới hạn dữ liệu và chỉ số

CSV hiện có khớp hoàn toàn bộ sinh dữ liệu tổng hợp với seed mặc định. Các mức giá là cấu hình mô phỏng. Kết quả chỉ có giá trị trong mô phỏng đang dùng, chưa chứng minh hiệu quả triển khai trên hệ thống thực.

Ở dữ liệu gốc, đỉnh mua điện No-battery là 89,30 kW trên train, 72,73 kW trên validation và 57,35 kW trên test. Không có bước nào vượt ngưỡng phạt 90 kW. Bộ điều khiển vẫn có thể làm đỉnh tăng khi sạc; kết quả hiện tại chưa đại diện cho hệ thống No-battery thường xuyên quá ngưỡng. Muốn kết luận về xử lý quá tải cần một cấu hình tải/ngưỡng riêng, áp dụng công bằng cho mọi thuật toán và chốt bằng validation.

Trọng số phạt vi phạm đang bằng 10 trong khi chi phí điện một bước có thể hàng nghìn đồng. Không nên suy ra rằng hệ số này đã đủ mạnh chỉ vì gọi là phạt an toàn. Theo dõi số lệnh bị cắt; an toàn vật lý được bảo đảm bởi bộ lọc.

Chỉ số tự tiêu thụ PV hiện dùng công thức kế thừa `1 - tổng điện bán / tổng PV`. Nếu có điện xả từ pin bán lên lưới hoặc pin được sạc từ lưới, đây là chỉ số gần đúng, chưa truy vết nguồn gốc năng lượng. Cần lưu ý trước khi diễn giải là tỷ lệ điện mặt trời tự tiêu thụ chính xác.

## Bàn giao mô hình cho Dương và Huỳnh

Bản tự viết hỗ trợ `SACAgent.load(path, device="cpu")` và `model.predict(obs, deterministic=True)`, trả `(action, None)` giống dạng gọi của SB3. Quan sát đơn có shape (7,), hành động có shape (1,), dtype float32. Khi tích hợp, dùng đúng chuẩn hóa và cấu hình đã lưu; không nhân hành động thêm 50 lần trước khi gọi env.

Để chạy lại đánh giá trên máy khác, chuyển cả thư mục lần chạy và CSV cùng nội dung. Dùng `--data-path data/processed.csv` nếu đường dẫn khác. Công cụ kiểm tra hash CSV và từ chối so sánh những lần chạy khác cấu hình môi trường/quy ước.

`best.pt`/`last.pt` chứa các mạng và optimizer, phục vụ suy luận/đánh giá. `resume.pt` mới của SAC tự viết có thêm replay buffer, RNG, trạng thái môi trường và log/best đồng bộ; dùng `--resume` với cùng cấu hình, seed, thư mục và CPU/CUDA để tiếp tục seed bị gián đoạn. Snapshot được lưu mỗi 10.000 bước. Các lượt pilot cũ chỉ có best/last, không có snapshot đầy đủ để resume. SB3 hiện chưa có chức năng resume trong công cụ này.

Để so sánh SAC/TD3/PPO/DDQN, các thành viên có thể đưa mô hình vào `evaluate_policy` thông qua cùng giao diện predict. DDQN cần thêm bước giải mã hành động rời rạc trước khi trả về lệnh liên tục; không đưa trực tiếp chỉ số 0–10 vào môi trường gốc.

## Tài liệu tham khảo

- [Báo cáo TH2 cập nhật của nhóm](Bao_cao_TH2_Nhom_7_cap_nhat.docx), mục 3.2 và 4.3.
- [Soft Actor-Critic Algorithms and Applications](https://arxiv.org/abs/1812.05905).
- [SAC trong Stable-Baselines3](https://stable-baselines3.readthedocs.io/en/master/modules/sac.html).
- [Gymnasium về kết thúc và cắt thời gian](https://gymnasium.farama.org/tutorials/gymnasium_basics/handling_time_limits/).
