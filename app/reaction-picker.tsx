"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { useEffect, useState } from "react";
import MediaPicker from "./media-picker";

const QUICK_REACTIONS = ["😂", "❤️", "👍", "👎", "🔥", "🥰", "👏"];

export default function ReactionPicker({
  onPick,
  onClose,
}: {
  onPick: (emoji: string) => void;
  onClose: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return (
    <div className={"reaction-picker " + (expanded ? "is-expanded" : "")}>
      <div className="quick-reactions" aria-label="Reaction nhanh">
        {QUICK_REACTIONS.map((emoji, index) => (
          <button
            type="button"
            key={emoji}
            className="quick-reaction"
            style={{ animationDelay: `${index * 24}ms` }}
            aria-label={`Thả ${emoji}`}
            onClick={() => onPick(emoji)}
          >
            {emoji}
          </button>
        ))}
        <button
          type="button"
          className="reaction-expand"
          aria-label={expanded ? "Thu gọn emoji" : "Mở tất cả emoji"}
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
        </button>
      </div>
      {expanded && (
        <MediaPicker
          initialTab="emoji"
          emojiOnly
          onEmoji={onPick}
          onGif={() => {}}
          onClose={onClose}
        />
      )}
    </div>
  );
}
