# Chạy thí nghiệm SAC trên Google Colab

Notebook dành cho Nguyễn Văn Trường, dùng Colab miễn phí và lưu kết quả trên Google Drive. Quy trình phân tích mô hình chạy thử, chọn cách đặt mục tiêu bằng validation, huấn luyện 300.000 bước cho seed 0–4 rồi đánh giá test. Các kết quả 50.000 bước đã có chỉ dùng làm mốc chẩn đoán.

## Mở notebook và lưu kết quả

1. Mở Google Colab bằng tài khoản Google của Trường. Chọn File → Upload notebook, mở `runs/colab_delivery/SAC_Colab_NguyenVanTruong.ipynb` trên máy.
2. Chọn File → Save a copy in Drive. Bản giao này đã nhúng mã nguồn, CSV và checkpoint pilot; không cần tải thêm dự án hoặc cung cấp GitHub token.
3. Kết nối runtime. Có thể chọn GPU trong Runtime → Change runtime type; notebook đo tốc độ CPU/GPU rồi chọn thiết bị nhanh hơn cho mạng nhỏ đang dùng.
4. Chạy lần lượt từ ô 1 hoặc chọn Runtime → Run all. Khi `drive.mount` yêu cầu, chọn tài khoản Drive của Trường.
5. Giữ `EXPERIMENT_NAME = 'SAC_Colab_20261127'` khi chạy tiếp thí nghiệm này. Kết quả nằm tại `MyDrive/SEMS_RL/SAC_Colab_20261127`.

Theo [FAQ Google Colab](https://research.google.com/colaboratory/faq.html), tài nguyên, loại GPU và thời lượng phiên miễn phí thay đổi; không có bảo đảm chạy hết cả kế hoạch trong một phiên. Notebook lưu `resume.pt` mỗi 10.000 bước và bỏ qua seed đã hoàn tất. Nếu ngắt phiên, mở lại bản notebook trong Drive và chạy lại từ đầu với cùng tên thí nghiệm. Tiến độ sau snapshot gần nhất được chạy lại. Giữ CPU/CUDA như phiên trước; kết quả số có thể khác khi thay thiết bị hoặc phiên bản thư viện.

Notebook mẫu nhỏ trong `notebooks/` được theo dõi trong Git. Nếu dùng mẫu đó thay bản giao một file, ô 2 yêu cầu gói nguồn ZIP. `runs/colab_delivery/` chứa các bản giao lớn và nằm ngoài Git như các checkpoint khác. Lệnh `python scripts/build_sac_colab.py` tạo cả bản tham chiếu có checkpoint cũ, vì vậy cần có `runs/sac_pilot/custom_seed0/` trước.

Để chạy GPU mới hoàn toàn từ bản clone, dùng `python scripts/build_sac_colab.py --gpu-only`, rồi tải `runs/colab_delivery/SAC_Colab_GPU_ChayMoi.ipynb` lên Colab. Bản này đã nhúng mã nguồn/CSV, không cần checkpoint cũ; bắt buộc chọn runtime GPU và dùng tên thí nghiệm mới. Ô thiết lập kiểm tra phép tính CUDA thật trước khi chạy. Các pilot được huấn luyện mới trước khi chọn cấu hình và phân tích S2/S3; sau đó mỗi seed chính thức vẫn khởi tạo từ đầu.

## Thứ tự các bước

| Bước | Việc thực hiện | Dữ liệu sử dụng |
| --- | --- | --- |
| Kiểm tra | Cài thư viện, xem CSV, chạy thử 200 bước | Train và validation nhỏ |
| Chẩn đoán | Nạp SAC cũ 50.000 bước; phân tích S2/S3/S5 | Validation |
| Pilot | Hai cách đặt mục tiêu, mỗi cách 50.000 bước × seed 0, 1 | Train; chọn checkpoint bằng validation |
| Chốt cấu hình | Chọn cách có tổng chi phí điều chỉnh S5 validation trung bình thấp nhất | Validation, không đọc kết quả test |
| Chính thức | Khởi tạo lại, chạy 300.000 bước × seed 0–4 | Train; chọn best.pt bằng validation |
| Tổng hợp | Trung bình và độ lệch chuẩn giữa seed, khóa hash mô hình | Validation |
| Test | Chạy S1–S5 trên 56 ngày test bằng các best.pt đã khóa | Test, không cập nhật mạng |

`STAGE='all'` chạy toàn bộ theo thứ tự. Có thể chọn `pilot`, `final` hoặc `test` để chỉ chạy một giai đoạn; các giai đoạn sau vẫn kiểm tra điều kiện hoàn tất trước đó. Không sửa cấu hình trong cùng thư mục thí nghiệm. Khi cần thiết kế thử nghiệm khác, đổi tên thư mục và nêu lý do thay đổi trước khi dùng kết quả test.

## Phân tích checkpoint chạy thử ngày 27 tháng 11 năm 2026

Các số dưới đây được tính lại từ checkpoint SAC tự viết cũ trên validation, SoC đầu 50%; S2 gồm 8 ngày, S3 và S5 mỗi kịch bản 54 ngày. Các kịch bản dùng lại một số ngày, không phải các mẫu lịch độc lập.

| Chỉ số trung bình/ngày | S2 chủ nhật | S3 PV còn 50% | S5 nguyên dữ liệu |
| --- | ---: | ---: | ---: |
| Điện sạc, kWh tại phía AC | 37,55 | 91,75 | 126,65 |
| Điện xả, kWh tại phía AC | 86,99 | 132,86 | 162,40 |
| Điện xả trong giá thấp điểm, kWh | 55,20 | 55,20 | 55,20 |
| PV dư trước khi dùng pin, kWh | 359,86 | 2,08 | 176,91 |
| Lệnh bị cắt khi SoC đã ở mức tối thiểu | 58,00 | 38,22 | 30,57 |
| Hao mòn, đồng | 58.377 | 105.287 | 135.489 |
| Tổng chi phí có điều chỉnh, đồng | 543.167 | 1.623.819 | 858.078 |

Mô hình xả hết phần điện ban đầu từ SoC 50% xuống 20% trong giờ thấp điểm: `0,3 × 200 × 0,92 = 55,2 kWh`. Ở nhiều bước sau đó nó vẫn yêu cầu xả khi pin đã ở mức tối thiểu. Đây là hành vi quan sát được trong CSV; chưa đủ để quy kết nguyên nhân chỉ cho số bước huấn luyện hay một tham số riêng lẻ.

S2 có nhiều PV dư nhưng mô hình chỉ sạc trung bình 37,55 kWh. S3 gần như không còn PV dư sau khi cấp tải, trung bình 2,08 kWh/ngày, nên điều kiện tích điện khác nhiều S5. Cần xem hình của ngày có chi phí SAC vượt No-battery nhiều nhất và CSV 96 quyết định để giải thích từng lệnh. `export_during_discharge_kwh` chỉ là lượng bán lưới tại các bước pin đang xả, không phải phép truy vết nguồn điện bán ra.

Với hiệu suất vòng `0,92² = 0,8464` và hao mòn 468,75 đồng/kWh thông lượng AC, một chu kỳ mua điện giá 1.100 đồng/kWh cần giá trị điện xả khoảng 2.322 đồng/kWh mới hòa vốn nếu chưa tính phạt. Công thức cho mỗi 1 kWh xả là `1100 / 0,8464 + 468,75 × (1 + 1 / 0,8464)`. Giá bình thường 1.800 đồng thấp hơn mức đó. Nếu đầu vào là PV dư có cơ hội bán 600 đồng/kWh, mức hòa vốn tương ứng khoảng 1.731 đồng/kWh. Đây là phép tính chu kỳ đầy đủ theo mô hình hao mòn hiện có, không áp dụng trực tiếp cho mọi bước hay điện pin sẵn có.

## Reward và tiêu chí chọn checkpoint

Trong cấu hình gốc:

`reward_t = -total_cost_t / C_ref`

`selection_cost = sum(total_cost_t) + (SoC_initial - SoC_final) × E_cap × eta_d × train_mean_price`

Vì vậy reward gốc không chứa khoản định giá điện pin dùng ròng. Ở checkpoint cũ, SoC cuối là 20%, khoản này bằng khoảng 101.552 đồng/ngày. Reward gốc còn được SAC chiết khấu với gamma=0,99, trong khi KPI ngày cộng các chi phí không chiết khấu. Reward và tiêu chí chọn checkpoint vì thế chưa cùng cách đo.

Cấu hình thử `daily_inventory` bổ sung:

`inventory_step_t = (SoC_t - SoC_next) × E_cap × eta_d × train_mean_price`

`reward_t = -(total_cost_t + inventory_step_t) / C_ref`

Khoản định giá được phân bổ theo bước; tổng của nó bằng khoản định giá cuối ngày. Dùng gamma=1 và `terminated=True` ở bước 96, không bootstrap sang ngày khác. Khi đó tổng reward ngày bằng chính xác `-adjusted_total_cost / C_ref`. SAC vẫn tối ưu thêm thành phần entropy trong lúc học; đẳng thức này nói về reward kinh tế, không có nghĩa mọi thành phần của mục tiêu SAC đã trở thành hóa đơn ngày.

`daily_inventory` là một cách đặt bài toán hữu hạn theo ngày, khác giả định tiếp nối của cấu hình gốc. Pilot so sánh hai cách đặt bài toán gồm reward, gamma và terminal; không chứng minh tác động riêng của một thay đổi. Không sửa môi trường chung hay CSV của Sơn/Huỳnh. Nếu original thắng validation, notebook giữ original và phải tiếp tục ghi rõ chênh lệch reward/tiêu chí trong báo cáo.

## Lưu tiến độ và kiểm tra test

`best.pt` và `last.pt` chứa trọng số cùng optimizer để suy luận/đánh giá. `resume.pt` của SAC tự viết có thêm replay buffer, vị trí bộ nhớ, RNG của buffer/Python/NumPy/PyTorch/môi trường, bước hiện tại và các log/best tại cùng thời điểm. Khi khôi phục, CSV và best cũng được khôi phục đồng bộ với snapshot, tránh so với một best thuộc các bước chưa được lưu.

Snapshot ghi vào file tạm rồi thay thế file chính. Nếu runtime ngắt, dùng snapshot hoàn chỉnh gần nhất; ghi tệp qua Drive vẫn phụ thuộc trạng thái dịch vụ và mạng. Kiểm tra CPU đã xác nhận quá trình ngắt/khôi phục cho kết quả trọng số, optimizer và log loss khớp chạy liên tục, đi qua warmup, biên ngày và khi bộ nhớ đầy. Chưa kiểm tra khôi phục trên runtime GPU Colab thật.

Trước test, chương trình kiểm tra đủ 5 seed × 300.000 bước, cấu hình và dữ liệu đúng kế hoạch, đã tổng hợp validation. `configuration_lock.json` khóa cấu hình; `test_models_lock.json` khóa SHA-256 từng best.pt. Đánh giá test dùng các mô hình này, không fit hoặc chọn lại bằng test.

## Log và bàn giao cho Dương

Trong thư mục thí nghiệm trên Drive:

- `diagnosis_pilot/`: bảng hành vi theo ngày, tổng hợp và hình S2/S3/S5.
- `pilots/original/`, `pilots/daily_inventory/`: log, checkpoint và kết quả validation của các pilot.
- `pilot_comparison.csv`, `configuration_lock.json`, `locked_config.yaml`: bằng chứng chọn cấu hình trước test.
- `final/custom_seedN/training.csv`: loss, alpha, Q mỗi 1.000 bước; warmup chưa có loss.
- `final/custom_seedN/validation.csv`: reward và chi phí validation theo số bước học.
- `final/custom_seedN/resume.pt`: snapshot để chạy tiếp khi runtime ngắt.
- `final_validation/`, `final_test/`: `daily_metrics.csv`, `seed_metrics.csv`, `summary.csv`, metadata và hình.
- `SAC_ban_giao_Duong.zip`: best.pt, cấu hình, CSV nguồn và các kết quả cần bàn giao, không chứa các resume.pt lớn.

Dương cần báo cáo tiền điện gốc, tiền điện có điều chỉnh và tổng chi phí có điều chỉnh thành các chỉ số riêng; ghi rõ cách đặt mục tiêu được chọn, dữ liệu mô phỏng, số seed và độ lệch chuẩn. So sánh TD3/PPO/DDQN cần cùng quy ước kết thúc episode, định giá pin, kịch bản và chuẩn hóa. S4 chỉ nhiễu quan sát; chỉ số PV tự tiêu thụ kế thừa chưa truy vết nguồn điện trong pin. Kết quả tốt hơn chưa được bảo đảm bởi việc tăng ngân sách học.

Notebook và quy trình đã được chuẩn bị cho Colab. Kết quả huấn luyện 300.000 bước × 5 seed và kết quả test sẽ chỉ có sau khi notebook thực sự chạy hoàn tất trong tài khoản của Trường.
