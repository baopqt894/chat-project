"use client";
/* eslint-disable @next/next/no-img-element */
import {
  type CSSProperties,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { connectRealtime, type RealtimeConnection } from "../lib/realtime";
import { readApiResponse } from "../lib/http";
import MediaPicker from "./media-picker";
import ReactionPicker from "./reaction-picker";
import {
  LoaderCircle,
  Hash,
  Home,
  MessageCircle,
  Bookmark,
  MoreHorizontal,
  Plus,
  Search,
  ChevronDown,
  Headphones,
  Users,
  Send,
  Smile,
  Paperclip,
  X,
  Sun,
  Moon,
  LogOut,
  Menu,
  Video,
  PhoneOff,
  Mic,
  MicOff,
  VideoOff,
  ArrowLeft,
  ArrowRight,
  Clock,
  SquarePen,
  Lock,
  MessageSquare,
  Trash2,
  Pencil,
  Check,
  ArrowUpRight,
} from "lucide-react";
import { MemberPicker, PeopleManager } from "./members";
import MentionPicker, {
  getMentionOptions,
  type MentionOption,
  userHandle,
} from "./mention-picker";
type User = {
  id: string;
  name: string;
  initials: string;
  color: string;
  email: string;
  role: "owner" | "admin" | "member";
};
type Channel = {
  id: string;
  name: string;
  description: string;
  kind: string;
  members: string[];
  ownerId: string;
  managers: string[];
};
type Attachment = { name: string; data: string; gifId?: string };
type Message = {
  id: string;
  channelId: string;
  userId: string;
  text: string;
  createdAt: string;
  parentId: string | null;
  attachment: Attachment | null;
  reactions: Record<string, string[]>;
  edited?: boolean;
  clientMessageId?: string;
  delivery?: "sending" | "failed";
};
type Workspace = {
  transport?: "socket" | "polling";
  maxImageBytes?: number;
  user: User;
  users: User[];
  channels: Channel[];
  messages: Message[];
};
type Signal = {
  type: string;
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
  video?: boolean;
};
async function api(path: string, body?: unknown, method = "POST") {
  const r = await fetch(
    "/api/" + path,
    body === undefined
      ? { signal: AbortSignal.timeout(30000) }
      : {
          signal: AbortSignal.timeout(30000),
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
  );
  return readApiResponse(r);
}
function Avatar({ user, small = false }: { user?: User; small?: boolean }) {
  return (
    <span
      className={"avatar " + (small ? "small" : "")}
      style={{ background: user?.color || "#748179" }}
    >
      {user?.initials || "?"}
    </span>
  );
}
export default function Page() {
  const [ws, setWs] = useState<Workspace | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [dark, setDark] = useState(false),
    [active, setActive] = useState("general"),
    [text, setText] = useState(""),
    [attachment, setAttachment] = useState<Attachment | null>(null),
    [sending, setSending] = useState(false),
    [search, setSearch] = useState(""),
    [thread, setThread] = useState<string | null>(null),
    [reply, setReply] = useState(""),
    [online, setOnline] = useState<string[]>([]),
    [typing, setTyping] = useState(""),
    [modal, setModal] = useState(""),
    [mobile, setMobile] = useState(false),
    [tab, setTab] = useState("messages"),
    [mediaPicker, setMediaPicker] = useState<"emoji" | "gif" | null>(null),
    [mentionQuery, setMentionQuery] = useState<string | null>(null),
    [mentionIndex, setMentionIndex] = useState(0),
    [transitioning, setTransitioning] = useState(false),
    [dmQuery, setDmQuery] = useState(""),
    [dmSelected, setDmSelected] = useState<string[]>([]),
    [saved, setSaved] = useState<string[]>([]),
    [view, setView] = useState("home");
  const [register, setRegister] = useState(false),
    [email, setEmail] = useState("minh@gather.demo"),
    [password, setPassword] = useState("Demo12345!"),
    [name, setName] = useState(""),
    [authBusy, setAuthBusy] = useState(false);
  const [newName, setNewName] = useState(""),
    [description, setDescription] = useState(""),
    [kind, setKind] = useState("channel"),
    [selected, setSelected] = useState<string[]>([]),
    [edit, setEdit] = useState<Message | null>(null),
    [editText, setEditText] = useState("");
  const [reactionTarget, setReactionTarget] = useState<{
    message: Message;
    left: number;
    top: number;
    panelMaxHeight: number;
    placement: "up" | "down";
  } | null>(null);
  const [outbox, setOutbox] = useState<Message[]>([]);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const sendRef = useRef(false);
  const activeRef = useRef(active);
  useEffect(() => { activeRef.current = active; }, [active]);
  useEffect(() => {
    if (!reactionTarget) return;
    const closePicker = () => setReactionTarget(null);
    const scrollArea = document.querySelector(".messages-scroll");
    window.addEventListener("resize", closePicker);
    scrollArea?.addEventListener("scroll", closePicker);
    return () => {
      window.removeEventListener("resize", closePicker);
      scrollArea?.removeEventListener("scroll", closePicker);
    };
  }, [reactionTarget]);
  const allMessages = [...(ws?.messages || []), ...outbox.filter(m =>
    m.userId === ws?.user.id && !ws?.messages.some(x => x.id === m.id || (m.clientMessageId && x.clientMessageId === m.clientMessageId))
  )];
  const socket = useRef<RealtimeConnection | null>(null),
    end = useRef<HTMLDivElement>(null),
    fileInput = useRef<HTMLInputElement>(null),
    composerInput = useRef<HTMLTextAreaElement>(null),
    transitionTimer = useRef<ReturnType<typeof setTimeout> | null>(null),
    typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [call, setCall] = useState<{
      peer: string;
      channelId: string;
      state: string;
      video: boolean;
    } | null>(null),
    [muted, setMuted] = useState(false),
    [cameraOff, setCameraOff] = useState(false);
  const callRef = useRef<typeof call>(null),
    pc = useRef<RTCPeerConnection | null>(null),
    media = useRef<MediaStream | null>(null),
    localVideo = useRef<HTMLVideoElement>(null),
    remoteVideo = useRef<HTMLVideoElement>(null),
    remoteStream = useRef<MediaStream | null>(null),
    candidates = useRef<RTCIceCandidateInit[]>([]);
  const refresh = useCallback(async () => {
    try {
      const data = await api("workspace");
      setWs(data);
      setOutbox(items => items.filter(m => m.userId === data.user.id && !data.messages.some((x: Message) => x.id === m.id || (m.clientMessageId && x.clientMessageId === m.clientMessageId))));
    } catch (e) {
      if ((e as Error).message === "Vui lòng đăng nhập") setWs(null);
      else setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);
  const endCall = useCallback((notify = true) => {
    const c = callRef.current;
    if (notify && c)
      socket.current?.emit("signal", {
        to: c.peer,
        channelId: c.channelId,
        signal: { type: "end" },
      });
    pc.current?.close();
    pc.current = null;
    media.current?.getTracks().forEach((t) => t.stop());
    media.current = null;
    remoteStream.current = null;
    candidates.current = [];
    callRef.current = null;
    setCall(null);
    setMuted(false);
    setCameraOff(false);
  }, [setMuted, setCameraOff]);
  const updateCall = useCallback((c: NonNullable<typeof call>) => {
    callRef.current = c;
    setCall(c);
  }, []);
  const sendSignal = useCallback((signal: Signal) => {
    const c = callRef.current;
    if (c)
      socket.current?.emit("signal", {
        to: c.peer,
        channelId: c.channelId,
        signal,
      });
  }, []);
  const setupPeer = useCallback(
    async (video: boolean) => {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video,
      });
      media.current = stream;
      if (!callRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        throw new Error("Cuộc gọi đã kết thúc");
      }
      if (localVideo.current) localVideo.current.srcObject = stream;
      const peer = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      });
      pc.current = peer;
      stream.getTracks().forEach((t) => peer.addTrack(t, stream));
      peer.onicecandidate = (e) => {
        if (e.candidate)
          sendSignal({ type: "ice", candidate: e.candidate.toJSON() });
      };
      peer.ontrack = (e) => {
        remoteStream.current = e.streams[0];
        if (remoteVideo.current) remoteVideo.current.srcObject = e.streams[0];
      };
      peer.onconnectionstatechange = () => {
        if (peer.connectionState === "connected" && callRef.current)
          updateCall({ ...callRef.current, state: "connected" });
        if (peer.connectionState === "failed") {
          setError(
            "Không kết nối được cuộc gọi. Mạng này có thể cần TURN server.",
          );
          endCall();
        }
      };
      return peer;
    },
    [sendSignal, updateCall, endCall],
  );
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
        event.preventDefault();
        document.querySelector<HTMLInputElement>('.global-search input')?.focus();
      }
      if (event.key === 'Escape') { setModal(''); setEdit(null); setMobile(false); setMediaPicker(null); }
    };
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => {
      void refresh();
      setDark(localStorage.getItem("gather-theme") === "dark");
      try {
        setSaved(JSON.parse(localStorage.getItem("gather-saved") || "[]"));
      } catch {
        setSaved([]);
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [refresh]);
  useEffect(() => {
    if (!ws?.user.id) return;
    const s = connectRealtime(ws.transport);
    socket.current = s;
    s.on("connect", () => {
      if (ws.transport !== "polling") void refresh();
    });
    s.on("connect_error", (error: Error) => {
      setError(error.message || "Mất kết nối realtime. Đang thử lại…");
      if (error.message === "Vui lòng đăng nhập") { endCall(false); void refresh(); }
    });
    s.on("refresh", () => {
      void refresh();
    });
    s.on("presence", setOnline);
    s.on("typing", ({ channelId, name }) => {
      if (channelId === activeRef.current) {
        setTyping(name);
        if (typingTimer.current) clearTimeout(typingTimer.current);
        typingTimer.current = setTimeout(() => setTyping(""), 1800);
      }
    });
    s.on(
      "signal",
      async ({
        from,
        channelId,
        signal,
      }: {
        from: string;
        channelId: string;
        signal: Signal;
      }) => {
        try {
          if (signal.type === "invite") {
            if (callRef.current) {
              s.emit("signal", {
                to: from,
                channelId,
                signal: { type: "busy" },
              });
              return;
            }
            updateCall({
              peer: from,
              channelId,
              state: "incoming",
              video: !!signal.video,
            });
            return;
          }
          const current = callRef.current;
          if (
            !current ||
            current.peer !== from ||
            current.channelId !== channelId
          )
            return;
          if (signal.type === "end" || signal.type === "busy") {
            if (signal.type === "busy") setError("Người nhận đang bận.");
            endCall(false);
            return;
          }
          if (signal.type === "accept") {
            const p = await setupPeer(current.video);
            await p.setLocalDescription(await p.createOffer());
            sendSignal({ type: "offer", sdp: p.localDescription!.toJSON() });
          }
          if (signal.type === "offer" && signal.sdp) {
            const p = pc.current;
            if (!p) return;
            await p.setRemoteDescription(signal.sdp);
            for (const c of candidates.current) await p.addIceCandidate(c);
            candidates.current = [];
            await p.setLocalDescription(await p.createAnswer());
            sendSignal({ type: "answer", sdp: p.localDescription!.toJSON() });
          }
          if (signal.type === "answer" && signal.sdp && pc.current) {
            await pc.current.setRemoteDescription(signal.sdp);
            for (const c of candidates.current)
              await pc.current.addIceCandidate(c);
            candidates.current = [];
          }
          if (signal.type === "ice" && signal.candidate) {
            if (pc.current?.remoteDescription)
              await pc.current.addIceCandidate(signal.candidate);
            else candidates.current.push(signal.candidate);
          }
        } catch (e) {
          setError("Không thể gọi: " + (e as Error).message);
          endCall();
        }
      },
    );
    return () => {
      s.disconnect();
      socket.current = null;
    };
  }, [
    ws?.user.id,
    ws?.transport,
    refresh,
    updateCall,
    setupPeer,
    sendSignal,
    endCall,
  ]);
  useEffect(
    () => () => {
      endCall(false);
      if (typingTimer.current) clearTimeout(typingTimer.current);
      if (transitionTimer.current) clearTimeout(transitionTimer.current);
    },
    [endCall],
  );
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth" });
  }, [ws?.messages.length, outbox.length, active]);
  useEffect(() => {
    if (!call || call.state === "connected" || call.state === "incoming")
      return;
    const timer = setTimeout(() => {
      setError("Cuộc gọi không được trả lời hoặc hết thời gian kết nối.");
      endCall();
    }, 45000);
    return () => clearTimeout(timer);
  }, [call, endCall]);
  const channel = ws?.channels.find((c) => c.id === active) || ws?.channels[0];
  const user = (id: string) => ws?.users.find((u) => u.id === id);
  const renderMessageText = (value: string) => {
    const handles = new Set([
      "everyone",
      "here",
      "channel",
      ...(ws?.users.map(userHandle) || []),
    ]);
    return value.split(/(@[a-zA-Z0-9._-]+)/g).map((part, index) => {
      const handle = part.startsWith("@") ? part.slice(1) : "";
      return handles.has(handle) ? (
        <mark
          className={
            handle === userHandle(ws!.user) ? "mention is-current-user" : "mention"
          }
          key={`${part}-${index}`}
        >
          {part}
        </mark>
      ) : (
        part
      );
    });
  };
  const title = (c: Channel) =>
    c.kind === "dm"
      ? user(c.members.find((id) => id !== ws?.user.id) || "")?.name || c.name
      : c.name;
  const mentionUsers =
    channel?.members
      .map((id) => ws?.users.find((candidate) => candidate.id === id))
      .filter((candidate): candidate is User => Boolean(candidate)) || [];
  const mentionOptions = getMentionOptions(
    mentionUsers,
    online,
    mentionQuery || "",
  );
  const filteredDmUsers =
    ws?.users.filter(
      (person) =>
        person.id !== ws.user.id &&
        `${person.name} ${person.email}`
          .toLowerCase()
          .includes(dmQuery.trim().toLowerCase()),
    ) || [];
  const openDmModal = () => {
    setDmQuery("");
    setDmSelected([]);
    setModal("dm");
  };
  const toggleDmMember = (id: string) => {
    setDmSelected((current) => {
      if (current.includes(id)) return current.filter((item) => item !== id);
      if (current.length >= 9) {
        setError("Nhóm tin nhắn có tối đa 10 thành viên, gồm cả bạn.");
        return current;
      }
      return [...current, id];
    });
  };
  const updateMention = (value: string, caret: number) => {
    const match = value.slice(0, caret).match(/(?:^|\s)@([^\s@]*)$/);
    setMentionQuery(match ? match[1] : null);
    setMentionIndex(0);
  };
  const insertMention = (option: MentionOption) => {
    const input = composerInput.current;
    const caret = input?.selectionStart ?? text.length;
    const before = text.slice(0, caret);
    const match = before.match(/(?:^|\s)@([^\s@]*)$/);
    const start = match ? caret - match[1].length - 1 : caret;
    const inserted = `@${option.token} `;
    const next = text.slice(0, start) + inserted + text.slice(caret);
    setText(next);
    setMentionQuery(null);
    requestAnimationFrame(() => {
      input?.focus();
      const nextCaret = start + inserted.length;
      input?.setSelectionRange(nextCaret, nextCaret);
    });
  };
  const beginContentTransition = () => {
    setTransitioning(true);
    if (transitionTimer.current) clearTimeout(transitionTimer.current);
    transitionTimer.current = setTimeout(() => setTransitioning(false), 220);
  };
  const changeChannel = (id: string) => {
    if (id !== channel?.id || view !== "home") beginContentTransition();
    setActive(id);
    setThread(null);
    setText("");
    setAttachment(null);
    setMediaPicker(null);
    setMentionQuery(null);
    setSearch("");
    setMobile(false);
    setTyping("");
    setTab("messages");
    setView("home");
  };
  const changeTab = (nextTab: string) => {
    if (nextTab === tab) return;
    beginContentTransition();
    setTab(nextTab);
  };
  const changeView = (nextView: string) => {
    if (nextView === view) return;
    beginContentTransition();
    setView(nextView);
  };
  const act = async (fn: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };
  const login = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthBusy(true);
    await act(async () => {
      await api("auth", { email, password, name, register });
      await refresh();
    });
    setAuthBusy(false);
  };
  const deliver = async (draft: Message) => {
    if (sendRef.current) return;
    sendRef.current = true;
    setSending(true);
    setError("");
    setOutbox(items => [...items.filter(m => m.id !== draft.id), {...draft, delivery: "sending"}]);
    try {
      const result = await api("messages", {
        channelId: draft.channelId, text: draft.text, parentId: draft.parentId,
        clientMessageId: draft.clientMessageId,
        attachment: draft.attachment?.gifId ? null : draft.attachment,
        gifId: draft.attachment?.gifId,
      });
      setOutbox(items => items.map(m => m.id === draft.id ? result : m));
      void refresh();
    } catch (e) {
      setOutbox(items => items.map(m => m.id === draft.id ? {...m, delivery: "failed"} : m));
      setError((e as Error).message);
    } finally {
      sendRef.current = false;
      setSending(false);
    }
  };
  const send = async (parentId: string | null = null) => {
    if (!channel || !ws || sendRef.current) return;
    const content = parentId ? reply : text;
    const image = parentId ? null : attachment;
    if (!content.trim() && !image) return;
    const id = crypto.randomUUID();
    const draft: Message = {id, clientMessageId: id, channelId: channel.id,
      userId: ws.user.id, text: content, parentId, attachment: image,
      createdAt: new Date().toISOString(), reactions: {}};
    if (parentId) setReply("");
    else { setText(""); setAttachment(null); }
    await deliver(draft);
  };
  const startDM = async (id: string) => {
    const existing = ws?.channels.find(c => c.kind === "dm" && c.members.includes(id));
    if (existing) { changeChannel(existing.id); setModal(""); return; }
    await act(async () => {
      const c = await api("channels", {
        kind: "dm",
        members: [id],
        name: "Direct message",
      });
      await refresh();
      changeChannel(c.id);
      setModal("");
    });
  };
  const createConversation = async () => {
    if (!ws || !dmSelected.length || dmSelected.length > 9) return;
    if (dmSelected.length === 1) {
      await startDM(dmSelected[0]);
      setDmQuery("");
      setDmSelected([]);
      return;
    }
    await act(async () => {
      const selectedNames = dmSelected
        .map((id) => ws.users.find((person) => person.id === id)?.name)
        .filter(Boolean);
      const c = await api("channels", {
        kind: "group",
        members: dmSelected,
        name: selectedNames.join(", ").slice(0, 60),
        description: "Nhóm tin nhắn riêng",
      });
      await refresh();
      changeChannel(c.id);
      setModal("");
      setDmQuery("");
      setDmSelected([]);
    });
  };
  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    await act(async () => {
      const c = await api("channels", {
        name: newName,
        description,
        kind,
        members: selected,
      });
      await refresh();
      changeChannel(c.id);
      setModal("");
      setNewName("");
      setDescription("");
      setSelected([]);
    });
  };
  const upload = async (file?: File) => {
    if (!file) return;
    if (
      !["image/png", "image/jpeg", "image/webp", "image/gif"].includes(
        file.type,
      ) ||
      file.size > (ws?.maxImageBytes || 5 * 1024 * 1024)
    ) {
      setError(`Chọn ảnh PNG, JPG, WEBP hoặc GIF, tối đa ${(ws?.maxImageBytes || 5 * 1024 * 1024) / 1024 / 1024}MB.`);
      return;
    }
    const reader = new FileReader();
    reader.onload = () =>
      setAttachment({ name: file.name, data: String(reader.result) });
    reader.readAsDataURL(file);
  };
  const toggleSaved = (id: string) => {
    const next = saved.includes(id)
      ? saved.filter((x) => x !== id)
      : [...saved, id];
    setSaved(next);
    localStorage.setItem("gather-saved", JSON.stringify(next));
  };
  const startCall = (video: boolean) => {
    if (!channel || channel.kind !== "dm") {
      setError("Mở tin nhắn riêng với một thành viên để gọi audio/video.");
      return;
    }
    const peer = channel.members.find((id) => id !== ws?.user.id)!;
    if (!online.includes(peer)) {
      setError("Thành viên hiện đang offline.");
      return;
    }
    updateCall({ peer, channelId: channel.id, state: "calling", video });
    socket.current?.emit("signal", {
      to: peer,
      channelId: channel.id,
      signal: { type: "invite", video },
    });
  };
  const reactTo = async (m: Message, emoji: string) => {
    setReactionTarget(null);
    if (!ws) return;
    const active = !m.reactions[emoji]?.includes(ws.user.id);
    const optimistic: Message = {
      ...m,
      reactions: {
        ...m.reactions,
        [emoji]: active
          ? [...new Set([...(m.reactions[emoji] || []), ws.user.id])]
          : (m.reactions[emoji] || []).filter((id) => id !== ws.user.id),
      },
    };
    setWs((current) =>
      current
        ? {
            ...current,
            messages: current.messages.map((item) =>
              item.id === m.id ? optimistic : item,
            ),
          }
        : current,
    );
    try {
      const updated = await api(
        "messages/" + m.id,
        { emoji, active },
        "PATCH",
      );
      setWs((current) =>
        current
          ? {
              ...current,
              messages: current.messages.map((item) =>
                item.id === updated.id ? updated : item,
              ),
            }
          : current,
      );
    } catch (reactionError) {
      setWs((current) =>
        current
          ? {
              ...current,
              messages: current.messages.map((item) =>
                item.id === m.id ? m : item,
              ),
            }
          : current,
      );
      setError((reactionError as Error).message);
    }
  };
  const openReactionPicker = (
    message: Message,
    button: HTMLButtonElement,
  ) => {
    const rect = button.getBoundingClientRect();
    const width = Math.min(370, window.innerWidth - 24);
    const quickHeight = 58;
    const spaceAbove = rect.top - 12;
    const spaceBelow = window.innerHeight - rect.bottom - 12;
    const placement =
      spaceBelow >= 360 || spaceBelow >= spaceAbove ? "down" : "up";
    const preferredTop =
      placement === "down" ? rect.bottom + 8 : rect.top - quickHeight - 8;
    const top = Math.max(
      12,
      Math.min(preferredTop, window.innerHeight - quickHeight - 12),
    );
    const panelMaxHeight = Math.max(
      150,
      placement === "up"
        ? top - 22
        : window.innerHeight - top - quickHeight - 22,
    );
    setReactionTarget({
      message,
      placement,
      panelMaxHeight,
      left: Math.max(
        12,
        Math.min(rect.right - width, window.innerWidth - width - 12),
      ),
      top,
    });
  };
  const renderMessage = (m: Message) => {
    const author = user(m.userId),
      replies = allMessages.filter((x) => x.parentId === m.id);
    return (
      <article className={"message " + (m.delivery ? "message-pending" : "")} key={m.id}>
        <Avatar user={author} />
        <div className="message-body">
          <div className="message-meta">
            <strong>{author?.name}</strong>
            <time>
              {new Date(m.createdAt).toLocaleTimeString("vi-VN", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </time>
            {m.edited && <small>đã chỉnh sửa</small>}
            {m.delivery === "sending" && <small role="status"><LoaderCircle className="spinner" size={12}/> Đang gửi…</small>}
            {m.delivery === "failed" && <button className="retry-message" disabled={sending} onClick={() => deliver(m)}>Gửi thất bại · Thử lại</button>}
          </div>
          <p>{renderMessageText(m.text)}</p>
          {m.attachment && (
            <a href={m.attachment.data} target="_blank" rel="noreferrer">
              <img
                className="message-image"
                src={m.attachment.data}
                alt={m.attachment.name}
              />
            </a>
          )}
          <div className="reactions">
            {Object.entries(m.reactions)
              .filter(([, ids]) => ids.length)
              .map(([emoji, ids]) => (
                <button
                  className={ids.includes(ws!.user.id) ? "reacted" : ""}
                  key={emoji}
                  disabled={busy}
                  aria-pressed={ids.includes(ws!.user.id)}
                  title={ids.map(id => user(id)?.name || id).join(", ")}
                  onClick={() => reactTo(m, emoji)}
                >
                  {emoji} {ids.length}
                </button>
              ))}
          </div>
          {!m.parentId && replies.length > 0 && (
            <button className="reply-link" onClick={() => setThread(m.id)}>
              <span className="mini-avatars">
                {replies.slice(0, 3).map((r) => (
                  <Avatar key={r.id} user={user(r.userId)} small />
                ))}
              </span>
              {replies.length} phản hồi <span>Xem thread</span>
            </button>
          )}
        </div>
        <div className="message-actions" style={m.delivery ? {display:"none"} : undefined}>
          <button
            title="Thả biểu cảm"
            disabled={busy}
            onClick={(event) => openReactionPicker(m, event.currentTarget)}
          >
            <Smile size={16} />
          </button>
          {!m.parentId && (
            <button
              title="Trả lời trong thread"
              onClick={() => setThread(m.id)}
            >
              <MessageSquare size={16} />
            </button>
          )}
          <button
            title="Lưu tin nhắn"
            className={saved.includes(m.id) ? "is-saved" : ""}
            onClick={() => toggleSaved(m.id)}
          >
            <Bookmark size={16} />
          </button>
          {m.userId === ws!.user.id && (
            <>
              <button
                title="Sửa tin nhắn"
                onClick={() => {
                  setEdit(m);
                  setEditText(m.text);
                }}
              >
                <Pencil size={15} />
              </button>
              <button
                title="Xóa tin nhắn"
                onClick={() => {
                  setEdit(m);
                  setModal("delete");
                }}
              >
                <Trash2 size={15} />
              </button>
            </>
          )}
        </div>
      </article>
    );
  };
  if (loading)
    return (
      <div className="loading">
        <div className="brand-mark">g</div>
        <p>Đang mở không gian làm việc…</p>
      </div>
    );
  if (!ws)
    return (
      <main className={"login " + (dark ? "dark" : "")}>
        <div className="login-story">
          <div className="brand">
            <span className="brand-mark">g</span>gather
            <span className="brand-dot">®</span>
          </div>
          <div>
            <span className="eyebrow">YOUR TEAM. ONE SPACE.</span>
            <h1>
              Ý tưởng hay
              <br />
              bắt đầu từ một
              <br />
              <em>cuộc trò chuyện.</em>
            </h1>
            <p>
              Kết nối đồng đội. Chia sẻ ý tưởng.
              <br />
              Cùng nhau làm nên những điều tuyệt vời.
            </p>
            <div className="story-avatars">
              {["MA", "LN", "KT", "HP"].map((s, i) => (
                <span
                  key={s}
                  style={{
                    background: ["#c78950", "#799a87", "#718eb9", "#ae829f"][i],
                  }}
                >
                  {s}
                </span>
              ))}
              <span className="team-label">Không gian dành cho cả đội.</span>
            </div>
          </div>
          <small>Ít khoảng cách hơn. Nhiều kết nối hơn.</small>
        </div>
        <div className="login-form">
          <div className="login-top">
            Không gian làm việc nội bộ <span>DEMO</span>
          </div>
          <form onSubmit={login}>
            <div className="welcome-icon">
              <MessageCircle size={27} />
            </div>
            <h2>{register ? "Gia nhập đội của bạn" : "Chào mừng trở lại"}</h2>
            <p>
              {register
                ? "Tạo tài khoản để bắt đầu kết nối."
                : "Một ngày làm việc tuyệt vời bắt đầu tại đây."}
            </p>
            {register && (
              <label>
                Họ và tên
                <input
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Nguyễn Minh Anh"
                />
              </label>
            )}
            <label>
              Email công việc
              <input
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label>
              Mật khẩu
              <input
                type="password"
                autoComplete={register ? "new-password" : "current-password"}
                minLength={8}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            {error && (
              <div role="alert" className="form-error">
                {error}
              </div>
            )}
            <button className="primary login-submit" disabled={authBusy}>
              {authBusy
                ? "Đang kết nối…"
                : register
                  ? "Tạo tài khoản"
                  : "Đăng nhập vào Gather"}
              <ArrowRight size={18} />
            </button>
            <div className="auth-switch">
              {register ? "Đã có tài khoản?" : "Chưa có tài khoản?"}{" "}
              <button
                type="button"
                onClick={() => {
                  setRegister(!register);
                  setError("");
                }}
              >
                {register ? "Đăng nhập" : "Đăng ký"}
              </button>
            </div>
            <div className="demo-box">
              <strong>Khám phá cùng đội demo</strong>
              <p>Chọn tài khoản để thử chat giữa hai cửa sổ.</p>
              <div>
                {["minh", "linh", "khoa", "ha"].map((id) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => {
                      setEmail(id + "@gather.demo");
                      setPassword("Demo12345!");
                      setRegister(false);
                    }}
                  >
                    {id === "minh"
                      ? "Minh Anh"
                      : id === "linh"
                        ? "Linh"
                        : id === "khoa"
                          ? "Khoa"
                          : "Hà"}
                    <ArrowUpRight size={13} />
                  </button>
                ))}
              </div>
              <small>Mật khẩu chung: Demo12345!</small>
            </div>
          </form>
          <footer>Gather — A little closer, a lot better.</footer>
        </div>
      </main>
    );
  const messages = allMessages.filter(
    (m) =>
      (view === "saved"
        ? saved.includes(m.id)
        : m.channelId === channel?.id && !m.parentId) &&
      (!search || m.text.toLowerCase().includes(search.toLowerCase())),
  );
  return (
    <div className={"workspace " + (dark ? "dark" : "")}>
      <header className="topbar">
        <div className="top-brand">
          gather<span>®</span>
        </div>
        <div className="history">
          <ArrowLeft size={17} />
          <ArrowRight size={17} />
          <Clock size={18} />
        </div>
        <label className="global-search">
          <Search size={17} />
          <input
            aria-label="Tìm tin nhắn"
            placeholder="Tìm kiếm trong Gather"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <span>⌘ K</span>
        </label>
        <span className="workspace-label">TEAM WORKSPACE</span>
        <button
          title="Đổi giao diện"
          onClick={() => {
            setDark(!dark);
            localStorage.setItem("gather-theme", !dark ? "dark" : "light");
          }}
        >
          {dark ? <Sun size={19} /> : <Moon size={19} />}
        </button>
      </header>
      <nav className="rail">
        <div className="workspace-icon">G</div>
        <button
          className={view === "home" ? "rail-active" : ""}
          onClick={() => changeView("home")}
        >
          <Home />
          <span>Home</span>
        </button>
        <button onClick={openDmModal}>
          <MessageCircle />
          <span>DMs</span>
        </button>
        <button onClick={() => setModal("directory")}>
          <Users />
          <span>Đội ngũ</span>
        </button>
        <button
          className={view === "saved" ? "rail-active" : ""}
          onClick={() => changeView("saved")}
        >
          <Bookmark />
          <span>Đã lưu</span>
        </button>
        <div className="rail-bottom">
          <button title="Tạo mới" onClick={() => setModal("create")}>
            <Plus />
          </button>
          <button title="Tài khoản" onClick={() => setModal("account")}>
            <Avatar user={ws.user} />
            <i className="online-dot" />
          </button>
        </div>
      </nav>
      <aside className={"sidebar " + (mobile ? "mobile-open" : "")}>
        <header>
          <h2>
            Gather team <ChevronDown size={17} />
          </h2>
          <button title="Tin nhắn mới" onClick={openDmModal}>
            <SquarePen size={20} />
          </button>
        </header>
        <div className="workspace-status">
          <span /> Cùng nhau làm điều tuyệt vời
        </div>
        <div className="sidebar-shortcuts">
          <button
            onClick={() => {
              changeView("home");
              setSearch("");
            }}
          >
            <MessageSquare size={17} />
            Tất cả tin nhắn
          </button>
          <button onClick={() => changeView("saved")}>
            <Bookmark size={17} />
            Tin nhắn đã lưu <span>{saved.length || ""}</span>
          </button>
        </div>
        <div className="side-heading">
          <span>
            <ChevronDown size={14} />
            Kênh trò chuyện
          </span>
          <button
            title="Thêm kênh"
            onClick={() => {
              setKind("channel");
              setModal("create");
            }}
          >
            <Plus size={16} />
          </button>
        </div>
        {ws.channels
          .filter((c) => c.kind === "channel" || c.kind === "group")
          .map((c) => (
            <button
              key={c.id}
              className={
                "channel " +
                (channel?.id === c.id && view === "home" ? "selected" : "")
              }
              onClick={() => changeChannel(c.id)}
            >
              {c.kind === "group" ? <Lock size={17} /> : <Hash size={18} />}
              <span>{c.name}</span>
              {c.id === "general" && <span className="channel-star">✧</span>}
            </button>
          ))}
        <button
          className="add-channel"
          onClick={() => {
            setKind("channel");
            setModal("create");
          }}
        >
          <Plus size={17} />
          Thêm kênh
        </button>
        <div className="side-heading dm-heading">
          <span>
            <ChevronDown size={14} />
            Tin nhắn trực tiếp
          </span>
          <button title="Thêm tin nhắn riêng" onClick={openDmModal}>
            <Plus size={16} />
          </button>
        </div>
        {ws.users
          .filter((u) => u.id !== ws.user.id)
          .map((u) => (
            <button
              key={u.id}
              className={
                "channel person " +
                (channel?.kind === "dm" && channel.members.includes(u.id)
                  ? "selected"
                  : "")
              }
              onClick={() => startDM(u.id)}
            >
              <span className="avatar-wrap">
                <Avatar user={u} small />
                <i
                  className={
                    online.includes(u.id) ? "online-dot" : "offline-dot"
                  }
                />
              </span>
              {u.name}
            </button>
          ))}
        <div className="sidebar-bottom">
          <div className="little-plant">✳</div>
          <strong>Mọi ý tưởng đều có chỗ.</strong>
          <p>
            Bắt đầu một cuộc trò chuyện.
            <br />
            Biết đâu điều hay đang chờ.
          </p>
          <button onClick={openDmModal}>
            Kết nối với đồng đội <ArrowUpRight size={14} />
          </button>
        </div>
      </aside>
      <main className="chat">
        <header className="chat-header">
          <button
            className="mobile-menu"
            title="Mở menu"
            onClick={() => setMobile(!mobile)}
          >
            <Menu />
          </button>
          <button className="channel-title" onClick={() => setModal("details")}>
            {view === "saved" ? (
              <Bookmark size={22} />
            ) : channel?.kind === "dm" ? (
              <span className="online-dot" />
            ) : channel?.kind === "group" ? (
              <Lock size={22} />
            ) : (
              <Hash size={24} />
            )}
            <h1>
              {view === "saved" ? "Tin nhắn đã lưu" : channel && title(channel)}
            </h1>
            <ChevronDown size={16} />
          </button>
          <div className="chat-header-right">
            <button
              className="member-stack"
              title="Thành viên"
              onClick={() => setModal("members")}
            >
              {channel?.members.slice(0, 3).map((id) => (
                <Avatar key={id} user={user(id)} small />
              ))}
              <span>{channel?.members.length}</span>
            </button>
            <span className="header-divider" />
            <button className="huddle-button" onClick={() => startCall(false)}>
              <Headphones size={18} />
              <span>Huddle</span>
            </button>
            <button title="Gọi video" onClick={() => startCall(true)}>
              <Video size={19} />
            </button>
            <button title="Chi tiết kênh" onClick={() => setModal("details")}>
              <MoreHorizontal size={21} />
            </button>
          </div>
        </header>
        <div className="chat-tabs">
          <button
            className={tab === "messages" ? "current" : ""}
            onClick={() => changeTab("messages")}
          >
            <MessageSquare size={15} />
            Tin nhắn
          </button>
          <button
            className={tab === "files" ? "current" : ""}
            onClick={() => changeTab("files")}
          >
            <Paperclip size={15} />
            Ảnh đã chia sẻ
          </button>
          <button onClick={() => setModal("details")}>
            <Users size={15} />
            Thông tin kênh
          </button>
        </div>
        <div className="conversation-layout">
          <div className="conversation">
            <div
              className={
                "messages-scroll " + (transitioning ? "is-transitioning" : "")
              }
              aria-busy={transitioning}
            >
              {transitioning && (
                <div className="content-skeleton" role="status" aria-label="Đang chuyển cuộc trò chuyện">
                  {["short", "long", "medium"].map((size, index) => (
                    <div className="skeleton-message" key={size}>
                      <span className="skeleton-avatar" />
                      <span className="skeleton-lines">
                        <i />
                        <i className={size} style={{ animationDelay: `${index * 70}ms` }} />
                      </span>
                    </div>
                  ))}
                </div>
              )}
              {view === "home" && !search && (
                <div className="channel-intro">
                  <div className="intro-icon">
                    {channel?.kind === "dm" ? (
                      <MessageCircle size={29} />
                    ) : (
                      <Hash size={33} />
                    )}
                  </div>
                  <h2>
                    {channel?.kind === "dm"
                      ? "Cùng bắt đầu trò chuyện"
                      : `Chào mừng đến với # ${channel?.name}`}
                  </h2>
                  <p>
                    {channel?.description ||
                      "Đây là không gian riêng để chia sẻ ý tưởng và kết nối với đồng đội."}
                  </p>
                  <button onClick={() => setModal("members")}>
                    <Users size={15} />
                    Xem thành viên <ArrowRight size={14} />
                  </button>
                </div>
              )}
              {search && (
                <div className="search-summary">
                  Kết quả cho “{search}” · {messages.length} tin nhắn
                </div>
              )}
              {tab === "files" ? (
                <div className="file-grid">
                  {messages
                    .filter((m) => m.attachment)
                    .map((m) => (
                      <a
                        key={m.id}
                        href={m.attachment!.data}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <img
                          src={m.attachment!.data}
                          alt={m.attachment!.name}
                        />
                        <span>{m.attachment!.name}</span>
                      </a>
                    ))}
                  {!messages.some((m) => m.attachment) && (
                    <div className="empty">
                      Chưa có ảnh được chia sẻ.
                      <br />
                      Gửi bức ảnh đầu tiên bằng nút đính kèm.
                    </div>
                  )}
                </div>
              ) : (
                <>
                  {messages.length > 0 && (
                    <div className="date-divider">
                      <span>
                        {new Date(messages[0].createdAt).toLocaleDateString(
                          "vi-VN",
                          { weekday: "long", day: "numeric", month: "long" },
                        )}
                        <ChevronDown size={12} />
                      </span>
                    </div>
                  )}
                  {messages.map(renderMessage)}
                  {messages.length === 0 && (
                    <div className="empty">
                      {search
                        ? "Không tìm thấy tin nhắn phù hợp."
                        : view === "saved"
                          ? "Lưu những tin nhắn quan trọng bằng biểu tượng bookmark."
                          : "Chưa có tin nhắn. Hãy gửi lời chào đầu tiên! 👋"}
                    </div>
                  )}
                </>
              )}
              <div ref={end} />
            </div>
            {view === "home" && (
              <div className="composer-area">
                {mentionQuery !== null && (
                  <MentionPicker
                    options={mentionOptions}
                    activeIndex={mentionIndex}
                    onActiveIndex={setMentionIndex}
                    onSelect={insertMention}
                  />
                )}
                {mediaPicker && <MediaPicker key={mediaPicker} initialTab={mediaPicker} onClose={()=>setMediaPicker(null)} onEmoji={emoji=>{const input=composerInput.current;const start=input?.selectionStart??text.length;const end=input?.selectionEnd??text.length;setText(text.slice(0,start)+emoji+text.slice(end));setMediaPicker(null);requestAnimationFrame(()=>{input?.focus();input?.setSelectionRange(start+emoji.length,start+emoji.length);});}} onGif={gif=>{setAttachment({name:gif.name+'.gif',data:gif.url,gifId:gif.id});setMediaPicker(null);composerInput.current?.focus();}}/>}
                <div
                  className="composer"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    void upload(e.dataTransfer.files[0]);
                  }}
                >
                  {attachment && (
                    <div className="attachment-preview">
                      <img src={attachment.data} alt="Ảnh đính kèm" />
                      <span>{attachment.name}</span>
                      <button
                        title="Bỏ ảnh"
                        onClick={() => setAttachment(null)}
                      >
                        <X size={16} />
                      </button>
                    </div>
                  )}
                  <textarea
                    ref={composerInput}
                    aria-label="Soạn tin nhắn"
                    placeholder={`Nhắn tin ${channel?.kind === "dm" ? "cho" : "đến #"} ${channel && title(channel)}`}
                    value={text}
                    maxLength={5000}
                    onChange={(e) => {
                      setText(e.target.value);
                      updateMention(e.target.value, e.target.selectionStart);
                      socket.current?.emit("typing", channel?.id);
                    }}
                    onKeyDown={(e) => {
                      if (mentionQuery !== null) {
                        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                          e.preventDefault();
                          const direction = e.key === "ArrowDown" ? 1 : -1;
                          setMentionIndex((index) =>
                            mentionOptions.length
                              ? (index + direction + mentionOptions.length) %
                                mentionOptions.length
                              : 0,
                          );
                          return;
                        }
                        if (e.key === "Escape") {
                          e.preventDefault();
                          setMentionQuery(null);
                          return;
                        }
                        if (
                          (e.key === "Enter" || e.key === "Tab") &&
                          mentionOptions[mentionIndex]
                        ) {
                          e.preventDefault();
                          insertMention(mentionOptions[mentionIndex]);
                          return;
                        }
                      }
                      if (
                        e.key === "Enter" &&
                        !e.shiftKey &&
                        !e.nativeEvent.isComposing
                      ) {
                        e.preventDefault();
                        void send();
                      }
                    }}
                  />
                  <div className="composer-tools">
                    <input
                      ref={fileInput}
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif"
                      hidden
                      onChange={(e) => {
                        void upload(e.target.files?.[0]);
                        e.target.value = "";
                      }}
                    />
                    <button
                      title="Đính kèm ảnh"
                      className="attach-button"
                      onClick={() => fileInput.current?.click()}
                    >
                      <Plus size={20} />
                    </button>
                    <button
                      title="Thêm emoji"
                      onClick={() => setMediaPicker(mediaPicker === "emoji" ? null : "emoji")}
                    >
                      <Smile size={19} />
                    </button>
                    <button title="Chọn GIF" className="gif-button" onClick={()=>setMediaPicker(mediaPicker === "gif" ? null : "gif")}>GIF</button>
                    <button
                      title="Nhắc tên"
                      onClick={() => {
                        const input = composerInput.current;
                        const caret = input?.selectionStart ?? text.length;
                        const prefix = caret && !/\s$/.test(text.slice(0, caret)) ? " @" : "@";
                        const next = text.slice(0, caret) + prefix + text.slice(caret);
                        setText(next);
                        setMentionQuery("");
                        setMentionIndex(0);
                        requestAnimationFrame(() => {
                          input?.focus();
                          const nextCaret = caret + prefix.length;
                          input?.setSelectionRange(nextCaret, nextCaret);
                        });
                      }}
                    >
                      <span className="at">@</span>
                    </button>
                    <span className="tool-divider" />
                    <button title="Gọi video" onClick={() => startCall(true)}>
                      <Video size={19} />
                    </button>
                    <button
                      className="send-button"
                      aria-label="Gửi tin nhắn"
                      disabled={sending || (!text.trim() && !attachment)}
                      onClick={() => send()}
                    >
                      {sending ? <LoaderCircle className="spinner" size={18}/> : <Send size={18} />}
                      <span className="send-divider" />
                      <ChevronDown size={13} />
                    </button>
                  </div>
                </div>
                <div className="composer-hint">
                  <span>
                    {typing ? (
                      `${typing} đang nhập…`
                    ) : (
                      <>
                        <span className="status-dot" /> {online.length} thành
                        viên đang online
                      </>
                    )}
                  </span>
                  <span>
                    <b>Enter</b> để gửi · <b>Shift + Enter</b> xuống dòng
                  </span>
                </div>
              </div>
            )}
          </div>
          {thread && (
            <aside className="thread-panel">
              <header>
                <h3>Thread</h3>
                <button title="Đóng thread" onClick={() => setThread(null)}>
                  <X size={20} />
                </button>
              </header>
              <div className="thread-messages">
                {allMessages
                  .filter((m) => m.id === thread || m.parentId === thread)
                  .map(renderMessage)}
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void send(thread);
                }}
              >
                <textarea
                  aria-label="Trả lời thread"
                  placeholder="Viết phản hồi…"
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                />
                <button className="primary" disabled={!reply.trim() || sending}>{sending && <LoaderCircle className="spinner" size={16}/>}
                  Gửi phản hồi <Send size={15} />
                </button>
              </form>
            </aside>
          )}
        </div>
      </main>
      {error && (
        <div className="toast" role="alert">
          {error}
          <button title="Đóng thông báo" onClick={() => setError("")}>
            <X size={16} />
          </button>
        </div>
      )}
      {(modal || edit) && (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) {
              setModal("");
              setEdit(null);
            }
          }}
        >
          <section
            className={
              "modal " +
              (["directory", "members", "create"].includes(modal)
                ? "people-modal"
                : modal === "dm"
                  ? "dm-modal"
                  : "")
            }
            role="dialog"
            aria-modal="true"
            aria-label="Hộp thoại"
          >
            <button
              className="modal-close"
              title="Đóng"
              onClick={() => {
                setModal("");
                setEdit(null);
                setDmQuery("");
                setDmSelected([]);
              }}
            >
              <X size={20} />
            </button>
            {modal === "create" ? (
              <form onSubmit={create}>
                <div className="welcome-icon">
                  <Hash />
                </div>
                <h2>Tạo không gian mới</h2>
                <p>Một nơi để đội của bạn cùng làm việc.</p>
                <label>
                  Loại trò chuyện
                  <select
                    value={kind}
                    onChange={(e) => setKind(e.target.value)}
                  >
                    <option value="channel">
                      Kênh công khai — cả workspace
                    </option>
                    <option value="group">
                      Nhóm riêng — thành viên được chọn
                    </option>
                  </select>
                </label>
                <label>
                  Tên kênh / nhóm
                  <input
                    required
                    maxLength={60}
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="VD: du-an-thang-9"
                  />
                </label>
                <label>
                  Mô tả
                  <input
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Kênh này dành cho điều gì?"
                  />
                </label>
                {kind === "group" && <><p className="people-note">Bạn được thêm tự động làm người tạo nhóm. Chọn một hoặc nhiều đồng đội.</p><MemberPicker users={ws.users} excluded={[ws.user.id]} selected={selected} onChange={setSelected}/></>}
                <button className="primary" disabled={busy} aria-busy={busy}>{busy && <LoaderCircle className="spinner" size={16}/>}
                  Tạo {kind === "channel" ? "kênh" : `nhóm (${selected.length + 1} người)`} <Plus size={16} />
                </button>
              </form>
            ) : modal === "directory" || modal === "members" ? (
              <PeopleManager key={modal + channel?.id} users={ws.users} current={ws.user} group={modal === "members" ? channel : undefined} online={online} onRefresh={refresh} onDM={startDM}/>
            ) : modal === "dm" ? (
              <div className="dm-dialog">
                <header>
                  <h2>Tin nhắn mới</h2>
                  <p>Chọn một người để nhắn riêng hoặc nhiều người để tạo nhóm.</p>
                </header>
                {dmSelected.length > 0 && (
                  <div className="dm-selected" aria-label="Thành viên đã chọn">
                    {dmSelected.map((id) => {
                      const person = ws.users.find((candidate) => candidate.id === id);
                      return person ? (
                        <button key={id} onClick={() => toggleDmMember(id)}>
                          <Avatar user={person} small />
                          {person.name}
                          <X size={13} />
                        </button>
                      ) : null;
                    })}
                  </div>
                )}
                <label className="dm-search">
                  <Search size={17} />
                  <input
                    autoFocus
                    aria-label="Tìm thành viên để nhắn tin"
                    placeholder="Tìm theo tên hoặc email"
                    value={dmQuery}
                    onChange={(event) => setDmQuery(event.target.value)}
                  />
                  <span>{dmSelected.length}/9</span>
                </label>
                <small className="dm-help">
                  Nhóm có tối đa 10 thành viên, gồm cả bạn.
                </small>
                <div className="dm-member-list">
                  {filteredDmUsers.map((person) => {
                    const checked = dmSelected.includes(person.id);
                    return (
                      <label className={checked ? "is-selected" : ""} key={person.id}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleDmMember(person.id)}
                        />
                        <span className="dm-avatar-wrap">
                          <Avatar user={person} />
                          <i className={online.includes(person.id) ? "online-dot" : "offline-dot"} />
                        </span>
                        <span>
                          <strong>{person.name}</strong>
                          <small>{person.email.split("@")[0]}</small>
                        </span>
                        <span className="dm-check" aria-hidden="true">
                          {checked && <Check size={15} />}
                        </span>
                      </label>
                    );
                  })}
                  {!filteredDmUsers.length && (
                    <div className="dm-empty">Không tìm thấy thành viên phù hợp.</div>
                  )}
                </div>
                <footer>
                  <button
                    type="button"
                    className="dm-cancel"
                    disabled={busy}
                    onClick={() => setModal("")}
                  >
                    Hủy bỏ
                  </button>
                  <button
                    type="button"
                    className="primary"
                    disabled={busy || !dmSelected.length}
                    aria-busy={busy}
                    onClick={() => void createConversation()}
                  >
                    {busy && <LoaderCircle className="spinner" size={16} />}
                    {dmSelected.length > 1 ? "Tạo nhóm tin nhắn" : "Bắt đầu nhắn tin"}
                  </button>
                </footer>
              </div>
            ) : modal === "account" ? (
              <>
                <Avatar user={ws.user} />
                <h2>{ws.user.name}</h2>
                <p>{ws.user.email}</p>
                <p>
                  <span className="status-dot" /> Đang hoạt động
                </p>
                <button
                  className="primary"
                  onClick={() =>
                    act(async () => {
                      endCall();
                      await api("logout", {});
                      setWs(null);
                      setModal("");
                    })
                  }
                >
                  <LogOut size={17} />
                  Đăng xuất
                </button>
              </>
            ) : modal === "details" ? (
              <>
                <div className="intro-icon">
                  <Hash />
                </div>
                <h2>{channel && title(channel)}</h2>
                <p>
                  {channel?.description || "Không gian trò chuyện của đội bạn."}
                </p>
                <div className="detail-row">
                  Quyền truy cập
                  <strong>
                    {channel?.kind === "channel"
                      ? "Cả workspace"
                      : "Chỉ thành viên"}
                  </strong>
                </div>
                <div className="detail-row">
                  Thành viên<strong>{channel?.members.length}</strong>
                </div>
                <button className="primary" onClick={() => setModal("members")}>
                  Xem thành viên <Users size={17} />
                </button>
              </>
            ) : modal === "delete" && edit ? (
              <>
                <h2>Xóa tin nhắn?</h2>
                <p>Tin nhắn và các phản hồi trong thread sẽ được xóa.</p>
                <button
                  className="danger"
                  disabled={busy}
                  onClick={() =>
                    act(async () => {
                      await api("messages/" + edit.id, {}, "DELETE");
                      setEdit(null);
                      setModal("");
                      await refresh();
                    })
                  }
                >
                  Xóa tin nhắn
                </button>
              </>
            ) : edit ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void act(async () => {
                    await api(
                      "messages/" + edit.id,
                      { text: editText },
                      "PATCH",
                    );
                    setEdit(null);
                    await refresh();
                  });
                }}
              >
                <h2>Chỉnh sửa tin nhắn</h2>
                <textarea
                  required
                  maxLength={5000}
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                />
                <button className="primary" disabled={busy} aria-busy={busy}>{busy && <LoaderCircle className="spinner" size={16}/>}
                  Lưu thay đổi <Check size={17} />
                </button>
              </form>
            ) : null}
          </section>
        </div>
      )}
      {reactionTarget && (
        <div
          className="reaction-overlay"
          onClick={() => setReactionTarget(null)}
        >
          <div
            className={`reaction-popover opens-${reactionTarget.placement}`}
            style={{
              left: reactionTarget.left,
              top: reactionTarget.top,
              "--reaction-panel-max-height": `${reactionTarget.panelMaxHeight}px`,
            } as CSSProperties}
            onClick={(event) => event.stopPropagation()}
          >
            <ReactionPicker
              onPick={(emoji) => reactTo(reactionTarget.message, emoji)}
              onClose={() => setReactionTarget(null)}
            />
          </div>
        </div>
      )}
      {busy && <div className="operation-status" role="status"><LoaderCircle className="spinner" size={16}/> Đang xử lý…</div>}
      {call && (
        <div className="call-backdrop">
          <section className="call-card">
            <div className="call-label">
              <Headphones size={17} />
              GATHER HUDDLE
            </div>
            <div className="call-person">
              <Avatar user={user(call.peer)} />
              <h2>{user(call.peer)?.name}</h2>
              <p>
                {call.state === "incoming"
                  ? "Cuộc gọi đến…"
                  : call.state === "connected"
                    ? "Đang kết nối trực tiếp"
                    : call.state === "calling"
                      ? "Đang gọi…"
                      : "Đang kết nối…"}
              </p>
            </div>
            <div className={"video-area " + (!call.video ? "audio-only" : "")}>
              <video
                autoPlay
                playsInline
                ref={(el) => {
                  remoteVideo.current = el;
                  if (el && remoteStream.current)
                    el.srcObject = remoteStream.current;
                }}
              />
              <video
                autoPlay
                playsInline
                muted
                className="local-video"
                ref={(el) => {
                  localVideo.current = el;
                  if (el && media.current) el.srcObject = media.current;
                }}
              />
            </div>
            <div className="call-controls">
              {call.state === "incoming" ? (
                <button
                  className="primary"
                  onClick={() =>
                    act(async () => {
                      try {
                        updateCall({ ...call, state: "connecting" });
                        await setupPeer(call.video);
                        sendSignal({ type: "accept" });
                      } catch (e) {
                        endCall();
                        throw e;
                      }
                    })
                  }
                >
                  Nhận cuộc gọi
                </button>
              ) : (
                <>
                  <button
                    title="Bật/tắt mic"
                    onClick={() => {
                      media.current
                        ?.getAudioTracks()
                        .forEach((t) => (t.enabled = muted));
                      setMuted(!muted);
                    }}
                  >
                    {muted ? <MicOff /> : <Mic />}
                  </button>
                  {call.video && (
                    <button
                      title="Bật/tắt camera"
                      onClick={() => {
                        media.current
                          ?.getVideoTracks()
                          .forEach((t) => (t.enabled = cameraOff));
                        setCameraOff(!cameraOff);
                      }}
                    >
                      {cameraOff ? <VideoOff /> : <Video />}
                    </button>
                  )}
                </>
              )}
              <button
                className="hangup"
                title="Kết thúc cuộc gọi"
                onClick={() => endCall()}
              >
                <PhoneOff />
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
