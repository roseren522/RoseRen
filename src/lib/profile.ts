import type { LearningEvent } from "./model";

export const avatarPresets = [
  { id: "sprout", label: "树苗" },
  { id: "leaf", label: "绿叶" },
  { id: "book", label: "书本" },
  { id: "flask", label: "烧瓶" },
  { id: "mountain", label: "山峰" },
  { id: "sun", label: "太阳" },
  { id: "waves", label: "海浪" },
  { id: "atom", label: "原子" },
] as const;
export type Avatar =
  | { type: "preset"; id: (typeof avatarPresets)[number]["id"] }
  | { type: "image"; dataUrl: string }
  | null;
export const avatarEntryId = "profile:avatar";
export const maxAvatarLength = 65536;

export function validAvatar(value: unknown): value is Avatar {
  if (value === null) return true;
  if (!value || typeof value !== "object") return false;
  const avatar = value as Record<string, unknown>;
  if (avatar.type === "preset")
    return avatarPresets.some((p) => p.id === avatar.id);
  return (
    avatar.type === "image" &&
    typeof avatar.dataUrl === "string" &&
    avatar.dataUrl.length <= maxAvatarLength &&
    /^data:image\/jpeg;base64,\/9j\/[A-Za-z0-9+/]+={0,2}$/.test(avatar.dataUrl)
  );
}

export function validateProfileEvent(event: LearningEvent) {
  if (
    event.kind !== "entry" ||
    event.entryId !== avatarEntryId ||
    event.payload.version !== 1 ||
    !validAvatar(event.payload.avatar)
  )
    throw new Error("头像记录无效");
}

export function avatarPayload(avatar: Avatar) {
  if (!validAvatar(avatar)) throw new Error("头像无效，请重新选择");
  return { activity: "profile", version: 1, avatar };
}

/** Rasterise and crop locally; originals and their metadata never leave the device. */
export async function prepareAvatar(file: File): Promise<Avatar> {
  if (file.size > 5 * 1024 * 1024)
    throw new Error("图片不能超过 5 MB，请选择较小的图片。");
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    throw new Error("请选择 JPG、PNG 或 WebP 图片。");
  const header = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const jpeg = header[0] === 255 && header[1] === 216 && header[2] === 255;
  const png = [137, 80, 78, 71, 13, 10, 26, 10].every(
    (v, i) => header[i] === v,
  );
  const webp =
    String.fromCharCode(...header.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...header.slice(8, 12)) === "WEBP";
  if (!jpeg && !png && !webp)
    throw new Error("无法读取这张图片，请换一张有效的 JPG、PNG 或 WebP 图片。");
  const url = URL.createObjectURL(file);
  const image = new Image();
  try {
    image.src = url;
    await image.decode();
    if (
      !image.naturalWidth ||
      !image.naturalHeight ||
      image.naturalWidth * image.naturalHeight > 40_000_000
    )
      throw new Error("图片尺寸过大或无法读取，请换一张较小的图片。");
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context)
      throw new Error("浏览器无法处理图片，请使用预设头像或更换浏览器。");
    const side = Math.min(image.naturalWidth, image.naturalHeight);
    for (const size of [256, 128]) {
      canvas.width = canvas.height = size;
      context.fillStyle = "#fffdf8";
      context.fillRect(0, 0, size, size);
      context.drawImage(
        image,
        (image.naturalWidth - side) / 2,
        (image.naturalHeight - side) / 2,
        side,
        side,
        0,
        0,
        size,
        size,
      );
      for (const quality of [0.85, 0.7, 0.55, 0.4, 0.25]) {
        const avatar: Avatar = {
          type: "image",
          dataUrl: canvas.toDataURL("image/jpeg", quality),
        };
        if (validAvatar(avatar)) return avatar;
      }
    }
    throw new Error("压缩后图片仍然过大，请换一张较简单的图片。");
  } catch (error) {
    if (error instanceof Error && error.name !== "EncodingError") throw error;
    throw new Error("无法读取这张图片，请换一张图片重试。");
  } finally {
    image.src = "";
    URL.revokeObjectURL(url);
  }
}
