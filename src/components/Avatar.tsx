import { useEffect, useRef, useState } from "react";
import {
  Atom,
  BookOpen,
  Check,
  FlaskConical,
  Leaf,
  LoaderCircle,
  Mountain,
  Sprout,
  Sun,
  Upload,
  Waves,
} from "lucide-react";
import { avatarPresets, prepareAvatar, type Avatar } from "../lib/profile";

const icons = {
  sprout: Sprout,
  leaf: Leaf,
  book: BookOpen,
  flask: FlaskConical,
  mountain: Mountain,
  sun: Sun,
  waves: Waves,
  atom: Atom,
};

export function AvatarView({
  avatar,
  initial = "R",
}: {
  avatar: Avatar;
  initial?: string;
}) {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [avatar]);
  const Icon = avatar?.type === "preset" ? icons[avatar.id] : undefined;
  return (
    <span
      className={`avatar-visual ${avatar?.type === "preset" ? `avatar-${avatar.id}` : ""}`}
      aria-hidden="true"
    >
      {avatar?.type === "image" && !broken ? (
        <img
          src={avatar.dataUrl}
          alt=""
          draggable={false}
          onError={() => setBroken(true)}
        />
      ) : Icon ? (
        <Icon />
      ) : (
        initial
      )}
    </span>
  );
}

export function AvatarEditor({
  avatar,
  initial,
  loggedIn,
  onSave,
  onDone,
}: {
  avatar: Avatar;
  initial: string;
  loggedIn: boolean;
  onSave: (avatar: Avatar) => Promise<unknown>;
  onDone: () => void;
}) {
  const [selected, setSelected] = useState(avatar);
  const [processing, setProcessing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const alive = useRef(true),
    lock = useRef(false);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const disabled = processing || saving;
  return (
    <div className="avatar-editor">
      <div className="avatar-editor-preview" role="img" aria-label="头像预览">
        <AvatarView avatar={selected} initial={initial} />
      </div>
      <h3>让学习空间，多一点你的样子。</h3>
      <p className="avatar-editor-hint">选择喜欢的图案，或上传自己的照片。</p>
      <div className="avatar-presets" role="group" aria-label="预设头像">
        {avatarPresets.map((p) => (
          <button
            key={p.id}
            className="avatar-preset"
            aria-label={`选择${p.label}头像`}
            aria-pressed={selected?.type === "preset" && selected.id === p.id}
            disabled={disabled}
            onClick={() => {
              setSelected({ type: "preset", id: p.id });
              setError("");
            }}
          >
            <AvatarView avatar={{ type: "preset", id: p.id }} />
            <span>{p.label}</span>
            {selected?.type === "preset" && selected.id === p.id && (
              <Check className="avatar-selected" size={13} />
            )}
          </button>
        ))}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        hidden
        aria-label="上传头像图片"
        onChange={async (e) => {
          const file = e.currentTarget.files?.[0];
          e.currentTarget.value = "";
          if (!file || lock.current) return;
          lock.current = true;
          setProcessing(true);
          setError("");
          try {
            const prepared = await prepareAvatar(file);
            if (alive.current) setSelected(prepared);
          } catch (err) {
            if (alive.current)
              setError(
                err instanceof Error ? err.message : "图片处理失败，请重试。",
              );
          } finally {
            lock.current = false;
            if (alive.current) setProcessing(false);
          }
        }}
      />
      <div className="avatar-upload-actions">
        <button
          className="button secondary"
          disabled={disabled}
          onClick={() => input.current?.click()}
        >
          {processing ? (
            <LoaderCircle size={16} className="spin" />
          ) : (
            <Upload size={16} />
          )}
          {processing ? "正在处理图片…" : "上传照片"}
        </button>
        <button
          className="text-button"
          disabled={disabled || selected === null}
          onClick={() => {
            setSelected(null);
            setError("");
          }}
        >
          恢复默认头像
        </button>
      </div>
      <p className="form-hint">
        支持 JPG、PNG、WebP，最大 5
        MB。照片会自动居中裁成正方形并压缩，原图不上传。
      </p>
      <p className="form-hint">
        {loggedIn
          ? "保存后头像先写入此设备，联网后同步到当前账号。云端保存状态请查看右上角。"
          : "未登录时头像保存在当前设备。登录后可在账号中设置，或合并本地记录。"}
      </p>
      {error && (
        <div className="avatar-error" role="alert">
          {error}
        </div>
      )}
      <div className="modal-actions">
        <button className="button secondary" disabled={saving} onClick={onDone}>
          取消
        </button>
        <button
          className="button primary"
          disabled={disabled}
          onClick={async () => {
            if (lock.current) return;
            lock.current = true;
            setSaving(true);
            setError("");
            try {
              await onSave(selected);
              if (alive.current) onDone();
            } catch (err) {
              if (alive.current)
                setError(
                  err instanceof Error
                    ? err.message
                    : "头像未保存，请保留当前选择并重试。",
                );
            } finally {
              lock.current = false;
              if (alive.current) setSaving(false);
            }
          }}
        >
          {saving && <LoaderCircle size={16} className="spin" />}
          {saving ? "正在保存…" : "保存头像"}
        </button>
      </div>
    </div>
  );
}
