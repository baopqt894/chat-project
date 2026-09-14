# Gather — demo nhắn tin nội bộ

Giao diện lấy cảm hứng từ Slack, hỗ trợ tiếng Việt, light/dark và mobile. Source website/API tư vấn cũ đã được gỡ.

## Chạy local

Yêu cầu Node.js 22+, npm.

```bash
npm install
npm run dev
# http://localhost:3000
```

Production local (custom Node server + Socket.IO):

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
- Local dùng Node server + Socket.IO. Vercel dùng Route Handler + MongoDB + HTTP polling như hướng dẫn bên dưới.
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

## Deploy Vercel — bắt buộc cấu hình MongoDB

Lỗi `Unexpected token '<'` trước đây do `/api/workspace` trả 404 HTML: API chỉ nằm trong custom server, không có Next.js Route Handler. Bản sửa có `app/api/[...path]/route.ts`, Vercel tự build thành Function; không chạy `server/index.mjs` trên Vercel.

1. Vercel → Project → Settings → Environment Variables: thêm **MONGODB_URI** ở Production (và Preview nếu muốn dùng preview). Database user cần quyền readWrite/createIndex trên database đích. Cho phép kết nối từ Vercel trong cấu hình network của MongoDB.
2. **MONGODB_DB** tùy chọn, mặc định **gather_demo**. Nên dùng DB riêng cho demo này.
3. Redeploy sau khi thêm/sửa environment variables. Framework Next.js, Build Command `npm run build`, Output Directory giữ mặc định.
4. Kiểm tra `/api/workspace`: chưa login phải trả **401 JSON**, không còn 404 HTML. Nếu thiếu URI trả **503 JSON / DATABASE_NOT_CONFIGURED**, nếu kết nối database lỗi trả 503 JSON thông báo cấu hình.
5. Đăng nhập các tài khoản demo ở trên. DB tự seed một lần; không copy file local lên Vercel. Tài khoản seed chỉ dành cho demo.

Không commit URI hoặc file chứa credential. `.env.example` chỉ có placeholder.

### Khác biệt giữa local và Vercel

| Nội dung | Custom Node local | Vercel / Next server chuẩn |
|---|---|---|
| API | Custom HTTP handler | Next.js Route Handler |
| Dữ liệu | `data/workspace.json` | MongoDB `workspaces`, `attachments` |
| Cập nhật chat | Socket.IO push | HTTP polling khoảng 1 giây, revision chỉ fetch lại khi dữ liệu đổi |
| Presence/typing/signaling | Socket.IO | MongoDB `presence`/`events`, TTL cleanup |
| Gọi | WebRTC media trực tiếp | WebRTC media trực tiếp; signaling qua polling |
| Ảnh | Tối đa 5MB, inline | Tối đa 2MB, collection riêng; download có kiểm tra session + membership |

Bản Mongo demo vẫn dùng snapshot workspace (giới hạn metadata 3MB) và optimistic concurrency để tránh ghi đè giữa instance; ảnh tách riêng để không vượt response limit. Khi mở rộng cần tách collection entity, pagination và object storage. Presence có thể mất tối đa khoảng 15 giây để offline khi đóng trình duyệt. Polling không phải WebSocket và có độ trễ khoảng 1–3 giây; khi tab/background throttled có thể lâu hơn. WebRTC vẫn cần HTTPS và TURN cho mạng khó kết nối.

### Kiểm thử đúng đường chạy Vercel ở local

```bash
npm run build
node scripts/preview-cloud.mjs
# http://localhost:3002 — MongoDB tạm, không đụng dữ liệu local/production
```

Hoặc đặt MONGODB_URI/MONGODB_DB trong môi trường rồi chạy `npx next start`. `npm test` có cả integration test Node/Socket.IO cũ và Route Handler/MongoDB mới; lần đầu có thể tải MongoDB binary dùng cho test.

## Emoji và GIF mặc định

Nút mặt cười trong composer mở 64 emoji chia theo nhóm và tìm kiếm tiếng Việt/không dấu. Nút GIF mở 8 Animated Noto Emoji đóng gói trong `public/gifs`, không yêu cầu API key. Chọn GIF chỉ thêm bản xem trước; bấm Gửi để chia sẻ. API nhận `gifId` thuộc danh mục `lib/chat-media.mjs`, không nhận URL GIF tùy ý.

Các GIF của Google dùng giấy phép CC BY 4.0; ghi công và link nguồn nằm trong bộ chọn và `public/gifs/NOTICE.md`.
