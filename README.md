# Gather — demo nhắn tin nội bộ

Giao diện lấy cảm hứng từ Slack, hỗ trợ tiếng Việt, light/dark và mobile. Source website/API tư vấn cũ đã được gỡ.

## Chạy local

Yêu cầu Node.js 22+, npm.

```bash
npm install
npm run dev
# http://localhost:3000
```

Production local (server Node chạy liên tục, không phải static hosting/serverless):

```bash
npm run build
npm start
```

Đổi cổng bằng `PORT=3001 npm run dev`. Dữ liệu tự khởi tạo ở `data/workspace.json`, được ghi nguyên tử và giữ qua restart. `DATA_DIR` đổi thư mục dữ liệu. Không chạy nhiều process cùng một DATA_DIR. Thư mục này được gitignore.

## Tài khoản demo

- `minh@gather.demo`
- `linh@gather.demo`
- `khoa@gather.demo`
- `ha@gather.demo`

Mật khẩu chung: `Demo12345!`. Đăng ký tạo tài khoản mới và tham gia các kênh công khai. Mở trình duyệt thường và ẩn danh để thử hai tài khoản. Các tin nhắn chào mừng là dữ liệu seed, trạng thái online lấy từ kết nối thực.

## Tính năng

- Đăng nhập/đăng ký/đăng xuất; cookie HttpOnly, session 7 ngày, mật khẩu scrypt + salt.
- Kênh công khai, nhóm riêng theo danh sách thành viên, DM 1–1 được tái sử dụng.
- Socket.IO realtime, presence, đang nhập, tự tải lại dữ liệu sau reconnect.
- Gửi tin nhắn, ảnh PNG/JPG/GIF/WEBP tối đa 5MB, kéo thả ảnh, xem ảnh đã chia sẻ.
- Thread, reaction, sửa/xóa tin của chính mình, tìm kiếm trong cuộc trò chuyện hiện tại.
- Bookmark và theme lưu trên trình duyệt.
- Audio/video WebRTC 1–1 qua DM: gọi/nhận/từ chối, mic/camera, kết thúc, timeout 45 giây. Người nhận phải online.

## API để chuyển sang NestJS

`server/backend.mjs` chứa HTTP API, authentication, storage và Socket.IO độc lập khỏi React. `server/index.mjs` ghép server này với Next.js. Frontend ở `app/page.tsx` gọi các endpoint tương đối `/api`.

| Method | Endpoint            | Nội dung                                                                     |
| ------ | ------------------- | ---------------------------------------------------------------------------- |
| POST   | `/api/auth`         | `{ email, password, register?, name? }`                                      |
| GET    | `/api/workspace`    | User hiện tại, users, channels/messages mà user được phép xem                |
| POST   | `/api/logout`       | Thu hồi session và ngắt socket của session                                   |
| POST   | `/api/channels`     | `{name, description?, kind: "channel" / "group" / "dm", members?: userId[]}` |
| POST   | `/api/messages`     | `{channelId, text?, parentId?, attachment?: {name, data: dataURL}}`          |
| PATCH  | `/api/messages/:id` | `{text}` hoặc `{emoji}` để toggle reaction                                   |
| DELETE | `/api/messages/:id` | Xóa tin và replies, chỉ chủ sở hữu                                           |

API lỗi trả `{error: string}` cùng HTTP status. API thành công trả entity hoặc `{ok:true}`. Socket xác thực từ cookie; event `refresh` yêu cầu fetch lại snapshot có phân quyền, `presence` chứa user IDs online, `typing` chứa channelId/name. Event `signal` chuyển invite/accept/offer/answer/ice/end/busy giữa thành viên DM; server gán người gửi, không tin user ID từ client.

```bash
curl -c /tmp/gather-cookie -X POST http://localhost:3000/api/auth \
  -H 'Content-Type: application/json' \
  -d '{"email":"minh@gather.demo","password":"Demo12345!"}'
curl -b /tmp/gather-cookie http://localhost:3000/api/workspace
curl -b /tmp/gather-cookie -X POST http://localhost:3000/api/messages \
  -H 'Content-Type: application/json' \
  -d '{"channelId":"general","text":"Xin chào từ API"}'
```

Khi tách NestJS: giữ contract, chuyển user/session/channel/message/attachment sang DB + object storage; reverse proxy `/api` và `/socket.io` về NestJS để frontend không đổi cookie/origin. Khi scale nhiều process cần database và Socket.IO Redis adapter.

## Giới hạn demo

- Một workspace, một server, lưu JSON; ảnh base64 trong snapshot. Chưa có pagination, quản lý nhiều workspace,  push notification, password recovery/email verification hoặc upload object storage.
- Chưa áp dụng rate limiting đăng nhập; không đưa nguyên bản demo công khai lên Internet với tài khoản seed.
- WebRTC dùng STUN công khai. Localhost cho phép camera/mic; khi dùng IP LAN/domain cần HTTPS. Mạng NAT/firewall phức tạp cần TURN riêng. Chưa gọi nhóm, share screen hay ghi âm.
- Chỉ hỗ trợ chạy Node server liên tục. Các thiết lập Cloudflare/vinext của website cũ đã gỡ.
- Nếu reverse proxy HTTPS, đặt `COOKIE_SECURE=true` và proxy WebSocket upgrade.

## Kiểm thử

```bash
npm run lint
npm run build
npm test
```

Integration test tạo data tạm, kiểm tra đăng nhập, đăng ký, realtime hai socket, quyền nhóm riêng, DM, signaling, typing, thread, reaction, sửa/xóa, ảnh, session revocation và persistence trên disk. Không ghi test API vào dữ liệu demo.

Xem `TESTING.md` cho kết quả kiểm thử trình duyệt và phạm vi WebRTC.

## Thành viên và phân quyền

- **Đội ngũ** mở danh bạ toàn workspace, không phụ thuộc kênh đang xem. Có tìm tên/email, lọc role, trạng thái online và nút nhắn tin riêng.
- Role workspace: **Owner** (Minh Anh trong demo đã migrate), **Admin**, **Member**. Tài khoản đăng ký mới luôn là Member. Chỉ Owner đổi Admin/Member; không tự đổi hoặc xóa Owner qua API này.
- Nhóm riêng: người tạo luôn có mặt, chọn nhiều người bằng checkbox; lọc role rồi chọn tất cả kết quả, có thể bỏ chọn từng người. Nhóm yêu cầu tối thiểu 2 thành viên.
- Trong danh sách thành viên nhóm, người tạo, Admin/Owner đã thuộc nhóm, hoặc người được giao quyền **Quản lý nhóm** có thể thêm/xóa thành viên. Chỉ người tạo hoặc Admin/Owner đã thuộc nhóm được giao/thu hồi quyền quản lý nhóm. Quản lý thường không được xóa quản lý khác. Không xóa người tạo, không giảm nhóm xuống dưới 2 người.
- Chọn theo role là thao tác hàng loạt trên danh sách hiện tại, không phải rule tự đồng bộ. Role thay đổi không tự thêm/xóa ai khỏi nhóm.
- Kênh công khai vẫn gồm toàn workspace; DM cố định 2 người. Admin bên ngoài nhóm riêng không được đọc hoặc sửa nhóm.
- Xóa thành viên làm mất quyền đọc/gửi tin nhóm ngay ở API. Role và membership lưu trong dữ liệu JSON hiện có qua migration không xóa hội thoại.

API mới:

| Method | Endpoint | Body |
|---|---|---|
| PATCH | `/api/users/:id` | `{ "role": "admin" }` hoặc `member`, chỉ Owner |
| PATCH | `/api/channels/:id/members` | `{ "add": ["user-id"], "remove": [], "managers": ["user-id"] }`; các field optional |

`managers` thay thế danh sách quản lý và kiểm tra toàn bộ trước khi ghi; add/remove là thay đổi tăng/giảm, không ghi đè danh sách thành viên từ snapshot cũ.
