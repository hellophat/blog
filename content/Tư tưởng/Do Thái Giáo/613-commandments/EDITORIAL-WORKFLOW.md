---
title: "Quy trình biên tập 613 điều răn"
draft: true
---

# Quy trình biên tập 613 điều răn

Tài liệu nội bộ này là tiêu chuẩn hoàn thành bắt buộc cho mỗi trang điều răn.

## Thứ tự công việc

1. Lập hồ sơ nguồn cho từng điều: Torah, công thức Maimonides, Mishnah/Talmud hoặc chương *Mishneh Torah*, và khảo luận lịch sử–ngôn ngữ.
2. Trích xuất mọi từ Hebrew, thuật ngữ phiên âm và khái niệm xa lạ với văn hóa Việt Nam.
3. Tạo hoặc cập nhật mục glossary với một `id` ổn định trước khi liên kết từ trang điều răn.
4. Soạn trang từ mẫu chuẩn; không xem trang là hoàn tất khi còn thiếu một trường bắt buộc.
5. Rà soát nội dung và rà soát kỹ thuật thành hai vòng độc lập.
6. Chạy `python3 audit_commandments.py --start P1 --end P248`, sửa toàn bộ lỗi rồi chạy Quartz build.

## Cấu trúc bắt buộc của mỗi trang

- Tiêu đề tiếng Việt.
- `English`.
- `Hebrew (Maimonides)` trùng chính xác với `index.md`.
- `Nguồn Torah`.
- `Ngữ nghĩa và cách dịch`.
- `Bối cảnh và ý nghĩa`.
- `Nguồn tham khảo` gồm ba lớp: văn bản chính; pháp điển và truyền thống rabbi; bối cảnh lịch sử và ngôn ngữ.
- Điều hướng điều trước, danh mục và điều sau nếu trang sau tồn tại.

## Quy tắc Hebrew và phiên âm

Dòng nguyên văn Hebrew của Maimonides không cần phiên âm toàn câu. Chỉ những từ hoặc cụm Hebrew được đưa vào phần giải thích bằng tiếng Việt mới phải được theo ngay bởi phiên âm chữ nghiêng và nghĩa tiếng Việt khi cần:

```markdown
**עֲבוֹדָה זָרָה** (*avodah zarah*, “sự phụng tự xa lạ”)
```

Không để một cụm Hebrew đứng riêng mà không phiên âm. Phiên âm ưu tiên khả năng đọc nhất quán cho độc giả Việt; không trộn nhiều hệ phiên âm trong cùng bài.

## Quy tắc glossary

Một thuật ngữ phải có mục glossary nếu nó là thiết chế, nghi thức, địa vị pháp lý, đồ vật phụng tự, kỳ lễ hoặc khái niệm không có tương đương rõ trong văn hóa Việt Nam. Mỗi mục phải:

- có Hebrew và phiên âm;
- giải thích phạm vi pháp lý, không chỉ dịch một từ;
- nêu điều dễ nhầm trong văn hóa Việt Nam;
- có neo HTML ổn định;
- được liên kết tại lần xuất hiện quan trọng trong trang.

## Hai vòng rà soát

### Nội dung

- Không đưa diễn giải rabbi vào như bản dịch từng chữ của Torah.
- Phân biệt Torah, Mishnah/Talmud, Maimonides và nghiên cứu lịch sử hiện đại.
- Không suy diễn một thực hành riêng thành đại diện cho mọi cộng đồng hoặc thời kỳ.
- Với luật bạo lực hoặc nhạy cảm, không chuyển các phạm trù dân tộc cổ sang cộng đồng hiện đại.
- Mỗi nhận định lịch sử có nguồn hoặc được ghi rõ là suy luận thận trọng.

### Kỹ thuật

- Hebrew trong văn xuôi có phiên âm; dòng nguyên văn Maimonides được miễn yêu cầu này.
- Thuật ngữ lạ có giải thích hoặc liên kết glossary.
- Mọi neo glossary tồn tại.
- English và Hebrew khớp `index.md`.
- Đủ các mục bắt buộc và ba tầng nguồn.
- Điều hướng không đứt.
- Audit không còn lỗi và Quartz build thành công.

## Trình tự dự án hiện tại

1. Chuẩn hóa P161–P190.
2. Audit và sửa toàn bộ P1–P190 theo tiêu chuẩn này.
3. P1–P248 đã vượt audit; toàn bộ các điều răn tích cực đã được biên soạn.
4. Nhóm điều cấm: N1–N260 đã được biên soạn và vượt audit. Các trang N theo cùng cấu trúc bắt buộc, có thêm mục **Đối chiếu lỗi thường gặp** và dung lượng lớn hơn các trang P.
5. Script `audit_commandments.py` nhận cả `P<số>` lẫn `N<số>`; `--start` và `--end` phải cùng loại. Mỗi lần chạy `--report` ghi đè `AUDIT-REPORT.md` cho đúng một khoảng, nên cần chạy lại cho khoảng muốn lưu.
6. Tiếp tục biên soạn theo từng nhóm kế tiếp và mở rộng phạm vi audit sau mỗi nhóm.
