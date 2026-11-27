# Hiển thị log khi Colab chờ huấn luyện SAC

Ảnh chụp ô 8 cho thấy notebook đang chờ trong `subprocess` và lần chạy bị ngắt có `KeyboardInterrupt`. Dấu vết này chưa xác định SAC gặp lỗi hay quá trình bị treo; ảnh khác vẫn báo “Đang thực thi (7 phút 55 giây)”. Bản notebook ban đầu không nối stdout/stderr của tiến trình huấn luyện về output Jupyter, nên việc không thấy log không chứng minh mô hình đã dừng.

## Tiếp tục thí nghiệm trên Drive

1. Nếu ô cũ còn chạy, dừng ô đó trước. Giữ các file trên Drive và không chạy hai notebook cùng ghi vào thí nghiệm này.
2. Tải `runs/colab_delivery/SAC_Colab_TiepTuc_HienLog.ipynb`, mở bằng File → Upload notebook trên Colab và lưu bản sao vào Drive.
3. Kiểm tra `EXPERIMENT_NAME` đúng với notebook cũ, mặc định `SAC_Colab_20261127`. Giữ cùng CPU/CUDA; notebook đọc lại `device_choice.json`.
4. Chạy các ô từ đầu để nối Drive, nạp đúng `source_bundle.zip` đã lưu và khôi phục các biến. `STAGE='final'` bỏ qua huấn luyện pilot, dùng cấu hình đã khóa, tiếp tục phần chính thức.
5. Khi tới ô 8, output sẽ hiện lệnh bắt đầu, log huấn luyện/validation và dòng thời gian mỗi 30 giây. Seed đủ 300.000 bước được giữ nguyên; seed chưa hoàn tất khôi phục snapshot gần nhất. Các bước sau snapshot mà chưa được lưu sẽ chạy lại.

Bản này giữ nguyên gói nguồn và SHA-256 mã huấn luyện của thí nghiệm cũ. Nó thay hàm `workflow.command` trong bộ nhớ để bắt stdout/stderr, không sửa cấu hình, gamma, reward hoặc nội dung checkpoint. Không xóa `configuration_lock.json`, không đổi tên thí nghiệm để chữa lỗi hiển thị.

Nếu muốn sửa ngay trong notebook đang mở, chèn một ô sau ô thiết lập, trước ô 8; dán toàn bộ nội dung `scripts/colab_log_patch.py` vào đó và chạy. Khi đó `workflow` và `OUTPUT` phải đã tồn tại. Sau khi thấy thông báo bật log trực tiếp, chạy lại ô 8.

## Đọc output

Ví dụ dạng thông báo, không phải số đo của lần chạy trên tài khoản Trường:

```text
▶ Bắt đầu train_sac.py | PID=1234. Thời gian/tiến độ được in mỗi 30 giây.
Tiếp tục seed 0 từ bước 40,000
⏱ 00:00:30 | seed=0 | train=42,000 bước | val=40,000 bước | mục tiêu=300,000 | PID=1234
```

`train` là bước gần nhất đã ghi vào `training.csv`, cập nhật theo cấu hình mỗi 1.000 bước. `val` là mốc đánh giá validation gần nhất, mỗi 10.000 bước. Trong lúc đánh giá, lưu snapshot hoặc đọc Drive, bước train có thể tạm đứng yên. Đồng hồ còn tăng chỉ cho biết hàm gọi vẫn đang chờ; cần thấy log hoặc bước train thay đổi để xác nhận tiến độ thuật toán.

Nếu chương trình báo đã có job của thí nghiệm đang chạy, nó chưa tạo tiến trình mới để tránh ghi trùng checkpoint. Ghi lại PID và output được báo, kiểm tra ô cũ. Không dùng lệnh dừng mọi tiến trình Python. Nếu phải kết nối lại runtime, giữ các file trên Drive rồi chạy notebook tiếp tục từ đầu.

Nếu chỉ thời gian tăng, còn bước train/val giữ nguyên kéo dài, cần lấy phần output gần nhất cùng thiết bị CPU/CUDA để phân biệt chờ I/O Drive, đánh giá, thiếu tài nguyên hoặc lỗi thật. Từ ảnh hiện có chưa thể khẳng định nguyên nhân nào ngoài thiếu log đã xác định trong notebook.

## Sau khi ô 8 hoàn tất

Xem đồ thị ở ô 9. Để chạy test bằng các mô hình đã khóa, đặt `STAGE='test'`, chạy lại các ô thiết lập và ô 10. Điều kiện đủ 300.000 bước × 5 seed và khóa mô hình vẫn được kiểm tra. Ô cuối đóng gói kết quả cho Dương.

Tham khảo cơ chế chờ tiến trình và chuyển hướng stdout/stderr tại [tài liệu subprocess của Python](https://docs.python.org/3/library/subprocess.html). Các giới hạn phiên và quyền truy cập Drive theo [FAQ Google Colab](https://research.google.com/colaboratory/faq.html).
