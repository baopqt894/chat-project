"use client";

import type { Person } from "./members";

export type MentionOption = {
  id: string;
  token: string;
  label: string;
  description: string;
  user?: Person;
};

const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

export function userHandle(user: Person) {
  return user.email.split("@")[0].replace(/[^a-zA-Z0-9._-]/g, "");
}

export function getMentionOptions(
  users: Person[],
  online: string[],
  query: string,
) {
  const options: MentionOption[] = [
    {
      id: "everyone",
      token: "everyone",
      label: "@everyone",
      description: "Nhắc tất cả thành viên có quyền xem cuộc trò chuyện này",
    },
    {
      id: "here",
      token: "here",
      label: "@here",
      description: `Nhắc ${online.filter((id) => users.some((user) => user.id === id)).length} thành viên đang online`,
    },
    {
      id: "channel",
      token: "channel",
      label: "@channel",
      description: "Nhắc mọi thành viên trong kênh hoặc nhóm hiện tại",
    },
    ...users.map((user) => ({
      id: user.id,
      token: userHandle(user),
      label: user.name,
      description: `@${userHandle(user)}`,
      user,
    })),
  ];
  const needle = normalize(query);
  return options.filter((option) =>
    option.user
      ? normalize(`${option.label} ${option.token} ${option.user.email}`).includes(
          needle,
        )
      : normalize(option.token).startsWith(needle),
  );
}

export default function MentionPicker({
  options,
  activeIndex,
  onActiveIndex,
  onSelect,
}: {
  options: MentionOption[];
  activeIndex: number;
  onActiveIndex: (index: number) => void;
  onSelect: (option: MentionOption) => void;
}) {
  return (
    <section className="mention-picker" role="listbox" aria-label="Chọn người để nhắc">
      <header>Thành viên và nhóm</header>
      <div className="mention-options">
        {options.map((option, index) => (
          <button
            type="button"
            role="option"
            aria-selected={index === activeIndex}
            key={option.id}
            onMouseEnter={() => onActiveIndex(index)}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onSelect(option)}
          >
            {option.user ? (
              <span
                className="avatar small"
                style={{ background: option.user.color }}
              >
                {option.user.initials}
              </span>
            ) : (
              <span className="mention-symbol">@</span>
            )}
            <span className="mention-label">
              <strong>{option.label}</strong>
              <small>{option.description}</small>
            </span>
            {option.user && <span className="mention-role">{option.user.role}</span>}
          </button>
        ))}
        {!options.length && <p>Không tìm thấy thành viên phù hợp.</p>}
      </div>
      <footer>↑↓ để chọn · Enter để chèn · Esc để đóng</footer>
    </section>
  );
}
