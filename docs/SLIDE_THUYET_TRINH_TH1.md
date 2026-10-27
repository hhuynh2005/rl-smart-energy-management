# KỊCH BẢN VÀ DÀN Ý SLIDE THUYẾT TRÌNH BÁO CÁO THỰC HÀNH 1
## MÔN HỌC: HỌC TĂNG CƯỜNG (REINFORCEMENT LEARNING)
### ĐỀ TÀI: ĐIỀU KHIỂN NĂNG LƯỢNG THÔNG MINH BẰNG HỌC TĂNG CƯỜNG (SEMS-RL)
**Thời gian báo cáo:** Sáng thứ 7, ngày 03/10/2026  
**Cơ cấu nhóm (5 thành viên):**  
- **🌱 Nhóm Môi trường (2 người):** Nguyễn Văn Huỳnh (Nhóm trưởng), Lý Đình Sơn  
- **⚙️ Nhóm Thuật toán (3 người):** Nguyễn Văn Trường, Phạm Quang Anh, Nguyễn Tùng Dương  

---

### SLIDE 1: TRANG TIÊU ĐỀ (TITLE SLIDE)
* **Tiêu đề chính:** HỆ THỐNG ĐIỀU KHIỂN NĂNG LƯỢNG THÔNG MINH SỬ DỤNG HỌC TĂNG CƯỜNG (SEMS-RL)
* **Tiêu đề phụ:** Báo cáo Thực hành 1: Miêu tả Đề tài & Mô hình hóa Quy trình quyết định Markov (MDP)
* **Giảng viên hướng dẫn:** [Tên Giảng Viên]
* **Danh sách nhóm:**
  - **Nhóm Môi trường & Dữ liệu:**
    1. Nguyễn Văn Huỳnh (Nhóm trưởng)
    2. Lý Đình Sơn
  - **Nhóm Thuật toán & Đánh giá:**
    3. Nguyễn Văn Trường
    4. Phạm Quang Anh
    5. Nguyễn Tùng Dương
* **Gợi ý lời thoại (Nguyễn Văn Huỳnh mở đầu):**
  > "Kính chào thầy và các bạn. Hôm nay, nhóm chúng em xin được báo cáo đề xuất đề tài cho học phần Học tăng cường: *Hệ thống điều khiển năng lượng thông minh sử dụng RL*. Để tối ưu hiệu quả triển khai, nhóm chúng em phân chia thành 2 bộ phận chuyên sâu: 2 bạn phụ trách Môi trường & Dữ liệu và 3 bạn phụ trách Thuật toán RL & Đối chuẩn. Sau đây, nhóm xin bắt đầu phần trình bày."

---

### SLIDE 2: ĐẶT VẤN ĐỀ & BỐI CẢNH THỰC TẾ
* **Nội dung hiển thị trên slide:**
  - **Bài toán chi phí năng lượng:** Biểu giá điện theo khung giờ (Time-of-Use - TOU) chênh lệch rất lớn giữa giờ cao điểm (chi phí đắt đỏ) và giờ thấp điểm.
  - **Tính bất định của Năng lượng tái tạo:** Điện mặt trời (Solar PV) phụ thuộc thời tiết, thường đạt đỉnh vào buổi trưa khi phụ tải tòa nhà chưa đạt cực đại.
  - **Áp lực phụ tải đỉnh (Peak Demand):** Doanh nghiệp và nhà máy phải trả chi phí phạt công suất đỉnh lớn nếu sử dụng quá nhiều điện cùng lúc.
  - **Hạn chế của phương pháp truyền thống:** Các luật cố định (Rule-based) hoặc quy hoạch tĩnh không thể thích ứng linh hoạt trước sự biến động ngẫu nhiên của thời tiết và phụ tải.
* **Gợi ý hình ảnh minh họa:** Biểu đồ biểu giá điện EVN 3 giá + Đồ thị hình chuông của sản lượng điện mặt trời.
* **Gợi ý lời thoại (Lý Đình Sơn):**
  > "Tại các nhà máy và tòa nhà lớn, chi phí tiền điện giờ cao điểm rất đắt. Khi tích hợp điện mặt trời và pin lưu trữ BESS, câu hỏi đặt ra là: Lúc nào nên nạp pin? Lúc nào nên xả pin? Nếu dùng các luật cố định thông thường, hệ thống sẽ rất cứng nhắc và không thể tối ưu được khi thời tiết thay đổi. Đây là lý do nhóm sử dụng Học tăng cường để giải quyết bài toán này."

---

### SLIDE 3: CÁC MỤC TIÊU CHÍNH & TÍNH NĂNG HỆ THỐNG
* **Nội dung hiển thị trên slide:**
  - **4 Mục tiêu cốt lõi:**
    1. Giảm thiểu tối đa chi phí tiền điện hàng tháng (Cost Minimization).
    2. San phẳng đỉnh phụ tải (Peak Shaving) và tăng tỷ lệ tự tiêu thụ năng lượng xanh.
    3. Bảo vệ tuổi thọ hệ thống pin lưu trữ (Hạn chế chai pin, kiểm soát số chu kỳ sạc/xả).
    4. Thích ứng thời gian thực với điều kiện thời tiết và phụ tải bất định.
  - **5 Tính năng phần mềm dự kiến:**
    - *Mô phỏng Môi trường năng lượng (Microgrid Digital Twin)*.
    - *Bộ điều khiển Agent RL tự động (Continuous Control)*.
    - *Module So sánh & Đánh giá với Baseline (Rule-based, Linear Programming)*.
    - *Dashboard trực quan hóa dòng năng lượng và chi phí tiết kiệm*.
    - *Cơ chế lọc an toàn (Safety Filter) & Can thiệp khẩn cấp thủ công*.
* **Gợi ý lời thoại (Lý Đình Sơn):**
  > "Mục tiêu của đề tài là xây dựng một hệ thống hoàn chỉnh: Agent vừa biết giảm tiền điện, vừa biết bảo vệ tuổi thọ của pin BESS không bị chai. Phần mềm sẽ có cả Dashboard trực quan và bộ lọc an toàn vật lý để ngăn chặn các sự cố kỹ thuật."

---

### SLIDE 4: CÔNG NGHỆ & BỘ 3 THUẬT TOÁN HỌC TĂNG CƯỜNG
* **Nội dung hiển thị trên slide:**
  - **3 Thuật toán Continuous RL:**
    - ⭐ **SAC (Soft Actor-Critic) - Thuật toán LÕI CHÍNH:** Off-policy, tối đa hóa entropy, hiệu quả lấy mẫu cực cao, khám phá không gian liên tục mượt mà.
    - **TD3 (Twin Delayed DDPG) - Thuật toán SO SÁNH 1:** Dùng 2 mạng Critic và cập nhật Actor trễ để triệt tiêu overestimation bias.
    - **PPO (Proximal Policy Optimization) - Thuật toán SO SÁNH 2:** On-policy an toàn, ổn định cao, phổ biến làm chuẩn so sánh.
  - **Thuật toán Đối chuẩn Baseline:** Rule-based Heuristic (sạc giờ thấp điểm/nắng trưa, xả giờ cao điểm).
  - **Ngăn xếp công nghệ:** Gymnasium (OpenAI Gym standard), PyTorch, Stable-Baselines3, FastAPI, Streamlit.
* **Gợi ý lời thoại (Nguyễn Văn Trường):**
  > "Vì công suất nạp xả của pin là đại lượng liên tục, nhóm tập trung vào 3 thuật toán Continuous Control hàng đầu hiện nay. Trong đó, SAC là thuật toán lõi chính nhờ cơ chế Maximum Entropy giúp học rất nhanh và ổn định. Đồng thời nhóm triển khai thêm TD3, PPO và Rule-based để có sự đối chuẩn toàn diện."

---

### SLIDE 5: PHÂN CÔNG CÔNG VIỆC TRONG NHÓM
* **Nội dung hiển thị trên slide:**
  - **🌱 NHÓM MÔI TRƯỜNG & DỮ LIỆU (2 người):**
    - **Nguyễn Văn Huỳnh (Nhóm trưởng):** Quản lý chung, kiến trúc môi trường Gymnasium (`MicrogridBessEnv`), mô hình động lực học pin, tổn hao nhiệt $\eta$, suy thoái pin theo chu kỳ.
    - **Lý Đình Sơn:** Thu thập và chuẩn hóa dữ liệu (Solar PV, Load, EVN TOU), lập trình Data Pipeline, xây dựng cơ chế Safety Guardrails chống quá tải pin.
  - **⚙️ NHÓM THUẬT TOÁN & ĐÁNH GIÁ (3 người):**
    - **Nguyễn Văn Trường (SAC Lead):** Lập trình mạng Actor-Critic cho SAC, tối ưu hóa Entropy tự động, thiết kế và tinh chỉnh hàm phần thưởng đa mục tiêu $R$.
    - **Phạm Quang Anh (TD3 & Baseline):** Triển khai thuật toán TD3 với Twin Critic, xây dựng thuật toán đối chuẩn Rule-based Heuristic, so sánh đối đầu SAC vs TD3.
    - **Nguyễn Tùng Dương (PPO & Evaluation):** Triển khai thuật toán PPO, viết pipeline đo lường chỉ số tiết kiệm (% tiền điện, % cắt đỉnh tải), xây dựng Dashboard & Slide.
* **Gợi ý lời thoại (Nguyễn Văn Huỳnh):**
  > "Nhóm phân định trách nhiệm rất rõ: 2 bạn Huỳnh và Sơn tập trung xây dựng Môi trường số và dữ liệu đầu vào chuẩn xác; 3 bạn Trường, Quang Anh và Dương chia nhau lập trình 3 thuật toán SAC, TD3, PPO và bộ Baseline để đảm bảo tiến độ và chất lượng kỹ thuật cao nhất."

---

### SLIDE 6: MÔ HÌNH HÓA MDP - KHÔNG GIAN TRẠNG THÁI VÀ HÀNH ĐỘNG
* **Nội dung hiển thị trên slide:**
  - **Không gian Trạng thái (State Space $\mathcal{S}$):**
    $$s_t = \big[ SoC_t, \; P_{\text{load}, t}, \; P_{\text{pv}, t}, \; C_{\text{grid}, t}, \; \sin(2\pi h_t/24), \; \cos(2\pi h_t/24), \; d_t \big]^T$$
    - $SoC_t \in [0, 1]$: Tỷ lệ pin còn lại (State of Charge).
    - $P_{\text{load}, t}$: Công suất phụ tải tiêu thụ tại bước $t$ (kW).
    - $P_{\text{pv}, t}$: Công suất điện mặt trời phát ra tại bước $t$ (kW).
    - $C_{\text{grid}, t}$: Giá điện lưới theo khung giờ TOU (VNĐ/kWh).
    - Mã hóa chu kỳ 24h bằng $\sin / \cos$ và cờ ngày làm việc/nghỉ $d_t$.
  - **Không gian Hành động liên tục (Action Space $\mathcal{A}$):**
    $$a_t \in [-1.0, 1.0]$$
    - $a_t > 0$: Sạc pin ($P_{\text{batt}, t} = a_t \cdot P_{\text{charge, max}}$).
    - $a_t < 0$: Xả pin ($P_{\text{batt}, t} = |a_t| \cdot (-P_{\text{discharge, max}})$).
    - $a_t = 0$: Nghỉ (Idle).
* **Gợi ý lời thoại (Nguyễn Văn Trường):**
  > "Vector trạng thái gồm 7 chiều nắm bắt đầy đủ thông tin: tình trạng pin, nhu cầu phụ tải, bức xạ mặt trời, giá điện và tính chu kỳ ngày/đêm. Không gian hành động liên tục chuẩn hóa trong khoảng [-1, 1] giúp các thuật toán SAC, TD3 và PPO học chính sách điều khiển cực kỳ mượt mà."

---

### SLIDE 7: MÔ HÌNH HÓA MDP - ĐỘNG LỰC HỌC VÀ CHUYỂN TRẠNG THÁI
* **Nội dung hiển thị trên slide:**
  - **Cân bằng công suất lưới điện:**
    $$P_{\text{grid}, t} = P_{\text{load}, t} - P_{\text{pv}, t} + P_{\text{batt}, t}$$
    - Nếu $P_{\text{grid}, t} > 0$: Hệ thống phải mua điện từ lưới.
    - Nếu $P_{\text{grid}, t} < 0$: Hệ thống dư thừa điện mặt trời phát ngược lên lưới.
  - **Phương trình cập nhật trạng thái Pin ($SoC_{t+1}$):**
    $$SoC_{t+1} = SoC_t + \dfrac{\eta \cdot P_{\text{batt}, t} \cdot \Delta t}{E_{\text{capacity}}}$$
    - Tính đến tổn hao năng lượng qua hiệu suất sạc $\eta_{\text{ch}}$ và xả $\eta_{\text{dis}}$ ($\approx 92\%$).
  - **Ràng buộc an toàn vật lý:** Tự động khóa sạc khi $SoC \ge 95\%$ và khóa xả khi $SoC \le 15\%$.
* **Gợi ý lời thoại (Lý Đình Sơn):**
  > "Môi trường được xây dựng tuân theo định luật cân bằng công suất và phương trình nhiệt động học của pin. Hiệu suất tổn hao nhiệt khi nạp xả được nhóm tính toán chi tiết để đảm bảo môi trường mô phỏng phản ánh đúng hệ thống pin lưu trữ ngoài thực tế."

---

### SLIDE 8: MÔ HÌNH HÓA MDP - THIẾT KẾ HÀM PHẦN THƯỞNG ĐA MỤC TIÊU
* **Nội dung hiển thị trên slide:**
  - **Công thức Hàm thưởng tổng quát:**
    $$r_t = - \Big[ \mathcal{C}_{\text{electricity}, t} + w_1 \cdot \mathcal{C}_{\text{degradation}, t} + w_2 \cdot \mathcal{C}_{\text{peak}, t} + w_3 \cdot \mathcal{P}_{\text{violation}, t} \Big]$$
  - **Ý nghĩa 4 thành phần:**
    1. **$\mathcal{C}_{\text{electricity}}$:** Chi phí mua điện thực tế từ lưới. Giảm thành phần này $\rightarrow$ Tiết kiệm tiền điện.
    2. **$\mathcal{C}_{\text{degradation}}$:** Chi phí khấu hao do sạc xả pin. Ngăn Agent đổi chiều sạc xả liên tục.
    3. **$\mathcal{C}_{\text{peak}}$:** Phạt lũy tiến khi công suất mua lưới vượt ngưỡng an toàn (Peak Shaving).
    4. **$\mathcal{P}_{\text{violation}}$:** Phạt nặng nếu để pin cạn kiệt hoặc quá đầy ngoài vùng cho phép.
  - **Hệ số chiết khấu $\gamma = 0.99$:** Đảm bảo Agent có tầm nhìn dài hạn, biết tích điện lúc rẻ để xả lúc đắt.
* **Gợi ý lời thoại (Phạm Quang Anh):**
  > "Hàm phần thưởng được thiết kế đa mục tiêu dưới dạng chi phí phạt âm. Cách tiếp cận này định hướng cho Agent không chỉ chăm chăm giảm tiền điện mà còn phải biết giữ gìn tuổi thọ của pin và cắt đỉnh phụ tải cho hệ thống."

---

### SLIDE 9: KẾ HOẠCH TRIỂN KHAI VÀ KỲ VỌNG ĐẠT ĐƯỢC
* **Nội dung hiển thị trên slide:**
  - **Lộ trình triển khai:**
    - *Giai đoạn 1 (Tuần 1-2):* Hoàn thiện môi trường Gym và chuẩn bị dữ liệu thực tế (Huỳnh & Sơn).
    - *Giai đoạn 2 (Tuần 3-4):* Huấn luyện SAC (Trường), TD3 & Rule-based (Quang Anh), PPO (Dương).
    - *Giai đoạn 3 (Tuần 5-6):* Tổng hợp Benchmark, hoàn thiện Dashboard và báo cáo tổng kết.
  - **Chỉ số đo lường hiệu quả (KPIs):**
    - Giảm chi phí điện năng: Kỳ vọng giảm từ **15% - 25%** so với cách vận hành truyền thống.
    - Cắt giảm công suất đỉnh (Peak Reduction): Giảm từ **20% - 30%** công suất đỉnh trong giờ cao điểm.
* **Gợi ý lời thoại (Nguyễn Tùng Dương):**
  > "Dự kiến sau khi huấn luyện xong 3 mô hình, nhóm em sẽ lập bảng so sánh đối chuẩn định lượng rõ ràng xem SAC vượt trội hơn TD3, PPO và Rule-based bao nhiêu phần trăm. Toàn bộ kết quả sẽ được trực quan hóa trên Dashboard để thầy và các bạn cùng theo dõi."

---

### SLIDE 10: LỜI CẢM ƠN & HỎI ĐÁP (Q&A)
* **Nội dung hiển thị trên slide:**
  - **CẢM ƠN THẦY VÀ CÁC BẠN ĐÃ LẮNG NGHE!**
  - **Hỏi & Đáp (Q&A):** Nhóm sẵn sàng giải đáp các câu hỏi từ thầy và lớp.
* **Gợi ý lời thoại (Nguyễn Văn Huỳnh kết thúc):**
  > "Trên đây là toàn bộ phần báo cáo của nhóm về đề tài Điều khiển năng lượng thông minh với RL. Nhóm chúng em rất mong nhận được những góp ý quý báu từ thầy và các bạn để hoàn thiện dự án tốt hơn trong các buổi thực hành tiếp theo. Em xin chân thành cảm ơn!"
