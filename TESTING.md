# Kết quả kiểm thử Gather

Ngày thực hiện: 14/09/2026. Môi trường: macOS, Node 22, Next.js 16.3.0, Chromium qua Playwright CLI.

## Đã pass

- `npm run lint`: không lỗi/warning.
- `npm run build`: production build và TypeScript thành công.
- `npm test`: 1 integration suite, hơn 25 assertions. Dùng HTTP server, hai Socket.IO client và thư mục dữ liệu tạm.
- API: yêu cầu session, sai mật khẩu, đăng ký, gửi/nhận realtime, sửa/xóa đúng chủ sở hữu, reaction, thread, kiểm tra nhóm riêng, DM không trùng, typing, signaling, ảnh hợp lệ/không hợp lệ, tin rỗng, logout thu hồi session, dữ liệu ghi xuống disk.
- Browser: đăng nhập Minh Anh và Linh trong hai browser context độc lập; gửi từ context A và thấy tin trong context B mà không reload.
- Browser: tạo nhóm riêng và chọn thành viên, đính kèm PNG qua file input thật, gửi ảnh, trả lời thread, bookmark, tìm kiếm không có kết quả.
- Browser: chuyển light/dark, kiểm tra desktop 1440×1000 và mobile 390×844, không tràn ngang.
- WebRTC: hai browser context dùng audio/video tổng hợp thay camera/mic thật. Hai đầu đạt trạng thái `connected`; nút kết thúc đóng cuộc gọi ở cả hai đầu.

## Chưa kiểm chứng

- Camera/microphone vật lý và chất lượng cuộc gọi giữa hai thiết bị/mạng Internet khác nhau. Chưa cấu hình TURN.
- Tải lớn, nhiều process, bảo mật production, iOS Safari và Android browser.

## Lỗi đã xử lý trong quá trình kiểm tra

- Server production đang giữ manifest build cũ dẫn đến chunk 404 sau rebuild: restart Node server để nạp bản build mới.
- Lint cảnh báo setState trong effect khởi tạo: chuyển bootstrap sang callback và thêm cleanup.
- Chạy HTTP integration test trong sandbox bị EPERM khi bind localhost: chạy lại với quyền cho cổng local, đã pass.
- Script upload ban đầu dùng Buffer không có trong Playwright CLI sandbox: chuyển sang file PNG thật, đã pass.

## Bằng chứng

Ảnh trong `output/playwright/` (gitignored): `login.png`, `workspace-light.png`, `workspace-dark.png`, `mobile.png`, `webrtc.png`.

Các test API tự xóa dữ liệu tạm. Nhóm/tin QA tạo bằng browser được dọn khỏi dữ liệu demo sau kiểm thử; giữ lại 4 tài khoản demo và các kênh seed.

## Bổ sung: role và quản lý thành viên

- API: Owner thay đổi Admin/Member; chặn Member tự nâng quyền, đổi Owner, role không hợp lệ. Quyền quản lý nhóm được kiểm tra độc lập ở backend.
- API: thêm nhiều người, chặn user ngoài nhóm, bảo vệ người tạo, kiểm tra ID, giao quản lý, chặn quản lý tự cấp quyền, xóa thành viên và chặn truy cập sau xóa, không sửa thành viên DM, không tạo nhóm một người.
- Browser (data QA riêng trên cổng 3001): mở danh bạ toàn workspace, đổi Linh thành Admin có xác nhận, tạo nhóm với hai người qua lọc Member, thêm Admin theo role, giao Khoa quản lý, xóa Hà, xác nhận số lượng cập nhật. Tất cả pass.
- Đã kiểm tra desktop/mobile; mobile chuyển bảng thành từng khối thành viên để thao tác không bị khuất theo chiều ngang.
- Dữ liệu QA của lần này tách hoàn toàn khỏi data demo cổng 3000. Dữ liệu cũ tự migrate role/ownerId/managers, không xóa tin nhắn.

## Sửa deployment Vercel

- Reproduce live: `https://chat-project-swart.vercel.app/api/workspace` trả HTTP 404, Content-Type text/html, body bắt đầu `<!DOCTYPE html>`.
- Build mới có dynamic route `/api/[...path]`; không cần custom Node process trên Vercel.
- `npm test`: 3 suite pass gồm local Socket.IO, JSON khi thiếu MongoDB config, và MongoDB tạm thực (không mock DB): seed/login, session persistence, 5 ghi đồng thời không mất tin, quyền role/nhóm, ảnh tách collection và auth download, signaling/typing/presence, logout, JSON lỗi hợp lệ.
- Browser chạy Next.js chuẩn + MongoDB tạm tại cổng 3002: hai context đăng nhập Minh/Linh; chat tự cập nhật, ảnh tải thành công qua API có session, presence cả hai user, WebRTC hai đầu connected bằng audio/video giả lập và hangup truyền sang bên còn lại. Tất cả pass.
- Chưa kiểm thử camera/mic vật lý, TURN và mạng ngoài. Vercel dùng HTTP polling khoảng 1 giây, không phải Socket.IO push.
- Production cần `MONGODB_URI` do chủ dự án cung cấp; `MONGODB_DB` mặc định `gather_demo`. Phân biệt push code với deployment đã Ready và live API đã truy cập DB được.

## Emoji/GIF mặc định

- API kiểm tra gifId thuộc danh mục, từ chối đường dẫn tùy ý; GIF được lưu dưới dạng tham chiếu asset, không nhân bản binary trong MongoDB.
- Bộ chọn gồm 64 emoji và 8 GIF Noto được đóng gói sẵn, có ghi công CC BY 4.0.
- Browser: tìm emoji không dấu, chèn và gửi; tìm GIF, chọn preview, gửi GIF, reload vẫn thấy ảnh; kiểm tra mobile không tràn ngang. Đã pass. Đã sửa nhãn accessibility bị đọc lặp của GIF picker.

## Cập nhật gửi nhanh và loading
- Tin mới hiện ngay trong outbox với trạng thái Đang gửi; lỗi có nút Thử lại.
- clientMessageId chống tạo trùng khi retry, kể cả nhiều request đồng thời (test MongoDB).
- Vercel polling chu kỳ tối thiểu 750ms khi tab hiện, 3s khi ẩn; không nối lại khi đổi kênh. Đây vẫn là polling, độ trễ nhận phụ thuộc mạng/server.
- Tạo kênh/nhóm, DM, chỉnh sửa/xóa có trạng thái xử lý và chặn submit lặp; quản lý thành viên/role có spinner.
- Lint, production build và 3 integration suites đều pass.
- Playwright mạng giả lập chậm 1,8s: tin hiện sau 60ms, lỗi 503 có thử lại; tải lại vẫn chỉ một tin; tạo kênh có loading và khóa nút.
- Reaction dùng bộ 64 emoji, hiển thị số lượt, trạng thái của bạn và tên người thả; API cho phép đặt active true/false để tránh đếm sai khi lặp request.
- Outbox hiện lưu trong phiên trang, chưa lưu offline qua reload.
- Reaction có thanh chọn nhanh 7 emoji, nút mở bảng đầy đủ 64 emoji, animation nhẹ và cập nhật lạc quan để bỏ độ trễ tải lại workspace.
- Composer hỗ trợ autocomplete khi gõ hoặc bấm `@`: chỉ liệt kê thành viên có quyền xem cuộc trò chuyện, kèm `@everyone`, `@here`, `@channel`; hỗ trợ lọc và điều khiển bằng phím.
- Mention hợp lệ được tô màu trong nội dung tin nhắn ở cả giao diện sáng và tối.
- Chuyển kênh, mục Đã lưu và tab Tin nhắn/Ảnh dùng skeleton 220ms cùng chuyển động opacity/transform; hiệu ứng tắt khi hệ điều hành bật giảm chuyển động.
- Modal Tin nhắn mới theo kiểu Discord: tìm kiếm, checkbox, chip đã chọn, trạng thái online, footer cố định; 1 người tạo DM, 2-9 người cùng người hiện tại tạo nhóm riêng tối đa 10 thành viên.
- Playwright đã xác nhận chọn hai thành viên tạo thành công nhóm 3 người và mở đúng cuộc trò chuyện; modal responsive thành bottom sheet trên viewport 390x844.
