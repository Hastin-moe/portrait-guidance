// T21 起步动作库：约 30 个常用人像动作；白墙影棚例图按需挂在 PRESET_THUMBS
import { uid, normalizePose } from "./model.js";

/** 起步预设例图：小B 知更鸟 cos，文件名 = 预设 id.jpg（见 web/img/pose-presets/） */
export const PRESET_THUMB_IDS = [
  "pose-lean", "pose-back", "pose-chin", "pose-sit", "sp-stand-front",
  "sp-contrapposto", "sp-walk", "sp-sit-cross", "sp-sit-forward", "sp-lie-side",
  "sp-squat", "sp-lean-wall", "sp-hand-hair", "sp-hand-face", "sp-over-shoulder",
  "sp-profile", "sp-look-down", "sp-laugh", "sp-book", "sp-curtain",
  "sp-flower", "sp-chair-straddle", "sp-floor-sit", "sp-stretch", "sp-hands-pocket",
  "sp-mirror", "sp-couple-lean", "sp-couple-walk", "sp-group-look", "sp-close-eye",
];

/** @deprecated 兼容旧测试/调用；键为预设 id，值为文件名 */
export const PRESET_THUMBS = Object.fromEntries(PRESET_THUMB_IDS.map(id => [id, id + ".jpg"]));

export function presetThumbUrl(presetId) {
  if (!presetId || !PRESET_THUMBS[presetId]) return "";
  return `/static/img/pose-presets/${PRESET_THUMBS[presetId]}`;
}

/** 从起步预设克隆一条可写入动作库的副本（新 id；有例图则作封面 url） */
export function clonePresetPose(starter) {
  const raw = JSON.parse(JSON.stringify(starter));
  const presetId = starter.id;
  raw.id = uid();
  raw.presetId = presetId;
  const thumb = presetThumbUrl(presetId);
  if (thumb) {
    raw.images = [{ id: uid(), file: "", source: "preset", url: thumb, note: "", cover: true }];
    raw.image = "";
    raw.imageSource = "preset";
    raw.imageUrl = thumb;
  } else {
    raw.images = [];
  }
  return normalizePose(raw);
}

export const STARTER_POSES = [
  { id: "pose-lean", name: "窗边倚靠", steps: ["侧身对窗", "重心移到后脚", "一手轻搭窗框"], cues: { weight: "重心在后脚", hands: "一手轻搭窗框", gaze: "看向窗外", pitfalls: "肩膀容易耸起" }, guide: "想象窗外有人轻轻叫你", sizes: ["half", "knee"], people: "1", dims: { mood: ["安静", "清冷"], stance: ["倚"], focus: ["全身"], prop: ["窗帘"], scene: ["窗边"] } },
  { id: "pose-back", name: "回眸", steps: ["身体背向镜头", "肩向窗侧", "视线回到镜头"], cues: { weight: "身体背向镜头", hands: "自然下垂", gaze: "肩向窗，视线回到镜头", pitfalls: "脖子拧得太紧" }, guide: "先看窗外，再慢慢回头看我", sizes: ["close", "bust"], people: "1", dims: { mood: ["灵动", "温柔"], stance: ["站"], focus: ["脸"], prop: ["无"], scene: ["窗边"] } },
  { id: "pose-chin", name: "托腮", steps: ["身体略前倾", "手背轻托下巴", "视线略低"], cues: { weight: "前倾", hands: "手背轻托下巴", gaze: "略低于镜头", pitfalls: "手挡住太多脸" }, guide: "像在想一件小事", sizes: ["close", "half"], people: "1", dims: { mood: ["慵懒", "松弛"], stance: ["坐"], focus: ["脸", "手"], prop: ["无"], scene: ["窗边"] } },
  { id: "pose-sit", name: "并肩坐", steps: ["两人同向坐下", "一人手搭对方肩", "一人看镜头一人看对方"], cues: { weight: "两人身体朝向一致", hands: "一人手搭对方肩", gaze: "一人看镜头一人看对方", pitfalls: "两人间距过大" }, guide: "靠得近一点，像刚聊完话", sizes: ["full", "knee"], people: "2", dims: { mood: ["亲密", "温柔"], stance: ["坐"], focus: ["全身"], prop: ["无"], scene: ["沙发"] } },
  { id: "sp-stand-front", name: "正面站立", steps: ["双脚与肩同宽", "重心略偏一脚", "肩放松"], cues: { weight: "略偏一脚", hands: "自然垂于身侧", gaze: "平视镜头", pitfalls: "双脚锁死" }, guide: "深吸一口气，肩放下来", sizes: ["full", "knee"], people: "1", dims: { mood: ["自信"], stance: ["站"], focus: ["全身"], prop: ["无"], scene: ["背景纸"] } },
  { id: "sp-contrapposto", name: "歇脚站姿", steps: ["一脚承重", "另一脚轻点", "髋微侧"], cues: { weight: "一脚承重", hands: "可叉腰或垂放", gaze: "看镜头或略偏", pitfalls: "腰拧过度" }, guide: "像等公交时的松弛站姿", sizes: ["full", "knee", "half"], people: "1", dims: { mood: ["慵懒", "自信"], stance: ["站"], focus: ["全身", "腿"], prop: ["无"], scene: ["户外"] } },
  { id: "sp-walk", name: "向前走", steps: ["迈出一步", "重心前移", "手臂自然摆"], cues: { weight: "迈步中", hands: "自然摆臂", gaze: "前方或镜头", pitfalls: "步伐过大显得僵" }, guide: "走向我，不用看脚", sizes: ["full", "knee"], people: "1", dims: { mood: ["活泼"], stance: ["走"], focus: ["全身", "腿"], prop: ["无"], scene: ["户外"] } },
  { id: "sp-sit-cross", name: "翘腿坐", steps: ["坐下", "一腿搭上", "上身微侧"], cues: { weight: "坐骨承重", hands: "搭在膝或扶手", gaze: "略侧看镜头", pitfalls: "肩一高一低过猛" }, guide: "像在咖啡馆等人", sizes: ["knee", "half"], people: "1", dims: { mood: ["慵懒", "自信"], stance: ["坐"], focus: ["全身"], prop: ["椅子"], scene: ["沙发"] } },
  { id: "sp-sit-forward", name: "前倾坐", steps: ["坐直", "肘撑膝或腿", "身体前倾"], cues: { weight: "前倾", hands: "肘撑膝", gaze: "看镜头", pitfalls: "驼背" }, guide: "像在认真听对方说话", sizes: ["half", "bust"], people: "1", dims: { mood: ["自信"], stance: ["坐"], focus: ["脸"], prop: ["椅子"], scene: ["沙发"] } },
  { id: "sp-lie-side", name: "侧躺", steps: ["侧卧", "下臂承头或垫枕", "上腿微曲"], cues: { weight: "侧卧", hands: "一手承头", gaze: "看镜头或远方", pitfalls: "脖子悬空" }, guide: "放松，像午后小憩", sizes: ["full", "knee"], people: "1", dims: { mood: ["慵懒", "温柔"], stance: ["躺"], focus: ["全身"], prop: ["无"], scene: ["沙发"] } },
  { id: "sp-squat", name: "蹲姿", steps: ["下蹲", "脚跟抬或脚跟跟提起", "手自然"], cues: { weight: "蹲", hands: "搭膝或抱膝", gaze: "仰视或平视", pitfalls: "蹲太低重心不稳" }, guide: "轻轻蹲下，别绷着", sizes: ["full", "knee"], people: "1", dims: { mood: ["活泼"], stance: ["蹲"], focus: ["全身"], prop: ["无"], scene: ["户外"] } },
  { id: "sp-lean-wall", name: "靠墙", steps: ["背或肩靠墙", "一脚点地", "手可插袋"], cues: { weight: "靠墙", hands: "插袋或垂放", gaze: "斜视镜头", pitfalls: "整个人贴死墙" }, guide: "只是轻轻靠一下", sizes: ["full", "knee", "half"], people: "1", dims: { mood: ["清冷", "自信"], stance: ["倚"], focus: ["全身"], prop: ["无"], scene: ["户外"] } },
  { id: "sp-hand-hair", name: "撩发", steps: ["侧脸", "手指轻拨发丝", "停在动作中"], cues: { weight: "站或坐", hands: "手指拨发", gaze: "看镜头或侧下", pitfalls: "手挡住眼睛" }, guide: "慢一点，停在半空", sizes: ["close", "bust"], people: "1", dims: { mood: ["温柔", "慵懒"], stance: ["站"], focus: ["脸", "手"], prop: ["无"], scene: ["窗边"] } },
  { id: "sp-hand-face", name: "手挡半脸", steps: ["手掌轻贴颊侧", "露出一只眼", "肩放松"], cues: { weight: "站或坐", hands: "轻挡半脸", gaze: "从指缝看镜头", pitfalls: "手太用力变形" }, guide: "像在害羞地偷看", sizes: ["close", "bust"], people: "1", dims: { mood: ["害羞", "忧郁"], stance: ["站"], focus: ["脸", "手"], prop: ["无"], scene: ["窗边"] } },
  { id: "sp-over-shoulder", name: "过肩看", steps: ["背对镜头", "头转向肩后", "眼看镜头"], cues: { weight: "背向", hands: "自然", gaze: "过肩看镜头", pitfalls: "转头过度皱纹" }, guide: "听到有人叫你的名字", sizes: ["bust", "half"], people: "1", dims: { mood: ["俏皮", "清冷"], stance: ["站"], focus: ["脸", "背"], prop: ["无"], scene: ["户外"] } },
  { id: "sp-profile", name: "侧面剪影", steps: ["完全侧脸", "视线前方", "颈线拉长"], cues: { weight: "侧立", hands: "垂放或轻抬", gaze: "看远方", pitfalls: "下巴太收" }, guide: "看向远处那扇窗", sizes: ["bust", "close"], people: "1", dims: { mood: ["清冷"], stance: ["站"], focus: ["脸"], prop: ["窗帘"], scene: ["窗边"] } },
  { id: "sp-look-down", name: "低头沉思", steps: ["头微低", "视线落地或膝", "肩松"], cues: { weight: "站或坐", hands: "可交叠", gaze: "向下", pitfalls: "双下巴角度" }, guide: "想一件让你安静的事", sizes: ["bust", "half"], people: "1", dims: { mood: ["忧郁", "安静"], stance: ["站"], focus: ["脸"], prop: ["无"], scene: ["背景纸"] } },
  { id: "sp-laugh", name: "开怀笑", steps: ["身体微后仰或前倾", "眼弯", "牙齿自然"], cues: { weight: "松弛", hands: "可捂嘴或张开", gaze: "看镜头或旁人", pitfalls: "假笑只动嘴" }, guide: "想想刚刚那句笑话", sizes: ["bust", "half"], people: "1", dims: { mood: ["活泼", "自信"], stance: ["站"], focus: ["脸"], prop: ["无"], scene: ["户外"] } },
  { id: "sp-book", name: "读书遮脸", steps: ["捧书", "书页挡下半脸", "眼看镜头或书"], cues: { weight: "坐或靠", hands: "捧书", gaze: "从书页上缘看", pitfalls: "书太高挡光" }, guide: "刚读到有趣的一句", sizes: ["half", "bust"], people: "1", dims: { mood: ["安静", "慵懒"], stance: ["坐"], focus: ["脸", "手"], prop: ["无"], scene: ["窗边"] } },
  { id: "sp-curtain", name: "掀帘", steps: ["一手掀帘", "半身露在帘后", "光落在脸"], cues: { weight: "站", hands: "掀帘", gaze: "看镜头或窗外", pitfalls: "帘挡太多脸" }, guide: "轻轻拉开一点光", sizes: ["half", "knee"], people: "1", dims: { mood: ["温柔", "期待"], stance: ["站"], focus: ["脸"], prop: ["窗帘"], scene: ["窗边"] } },
  { id: "sp-flower", name: "持花", steps: ["花举至颊侧或胸前", "鼻轻闻或停住", "肩松"], cues: { weight: "站", hands: "持花", gaze: "看花或镜头", pitfalls: "花挡住眼睛" }, guide: "闻一下，然后看我", sizes: ["bust", "half"], people: "1", dims: { mood: ["温柔"], stance: ["站"], focus: ["脸", "手"], prop: ["花"], scene: ["户外"] } },
  { id: "sp-chair-straddle", name: "跨坐椅背", steps: ["椅背朝前", "跨坐", "双臂搭椅背"], cues: { weight: "跨坐", hands: "搭椅背", gaze: "平视镜头", pitfalls: "椅不稳" }, guide: "放松，像休息间隙", sizes: ["knee", "half"], people: "1", dims: { mood: ["自信", "慵懒"], stance: ["坐"], focus: ["全身"], prop: ["椅子"], scene: ["背景纸"] } },
  { id: "sp-floor-sit", name: "席地而坐", steps: ["坐地", "一腿曲一腿伸或盘腿", "手撑地或抱膝"], cues: { weight: "坐地", hands: "撑地或抱膝", gaze: "看镜头", pitfalls: "腰塌" }, guide: "找一个舒服的姿势坐下", sizes: ["full", "knee"], people: "1", dims: { mood: ["松弛", "安静"], stance: ["坐"], focus: ["全身"], prop: ["无"], scene: ["户外"] } },
  { id: "sp-stretch", name: "伸懒腰", steps: ["双臂上举或后展", "胸微开", "停在最高点"], cues: { weight: "站", hands: "上举", gaze: "可闭眼或看镜头", pitfalls: "过度后仰" }, guide: "刚睡醒那样伸一下", sizes: ["full", "knee"], people: "1", dims: { mood: ["慵懒", "活泼"], stance: ["站"], focus: ["全身"], prop: ["无"], scene: ["窗边"] } },
  { id: "sp-hands-pocket", name: "插袋站", steps: ["双手或单手插袋", "肩一侧略低", "胯微侧"], cues: { weight: "一脚承重", hands: "插袋", gaze: "斜视镜头", pitfalls: "驼背" }, guide: "像街头等人的感觉", sizes: ["full", "knee", "half"], people: "1", dims: { mood: ["清冷", "自信"], stance: ["站"], focus: ["全身"], prop: ["无"], scene: ["户外"] } },
  { id: "sp-mirror", name: "对镜", steps: ["面向镜或假想镜", "整理发或衣领", "眼看镜中自己"], cues: { weight: "站", hands: "理发或理衣", gaze: "看镜", pitfalls: "动作太摆拍" }, guide: "假装在镜子前整理", sizes: ["half", "knee"], people: "1", dims: { mood: ["安静"], stance: ["站"], focus: ["脸", "手"], prop: ["无"], scene: ["窗边"] } },
  { id: "sp-couple-lean", name: "两人相倚", steps: ["一人靠墙或柱", "另一人靠其肩", "头可相触"], cues: { weight: "相倚", hands: "自然环抱或垂放", gaze: "一人镜头一人对方", pitfalls: "两人高度差不协调" }, guide: "靠紧一点，像说悄悄话", sizes: ["full", "knee"], people: "2", dims: { mood: ["亲密", "温柔"], stance: ["倚"], focus: ["全身"], prop: ["无"], scene: ["户外"] } },
  { id: "sp-couple-walk", name: "并肩走", steps: ["同向迈步", "内侧手可牵或轻碰", "节奏一致"], cues: { weight: "行走", hands: "可牵手", gaze: "前方或互看", pitfalls: "步伐不同步" }, guide: "一起慢慢往前走", sizes: ["full", "knee"], people: "2", dims: { mood: ["亲密", "活泼"], stance: ["走"], focus: ["全身"], prop: ["无"], scene: ["户外"] } },
  { id: "sp-group-look", name: "三人看向一点", steps: ["围成松散三角", "视线同一方向", "层次前后"], cues: { weight: "站或坐混", hands: "各自自然", gaze: "同一焦点", pitfalls: "排成一排太呆板" }, guide: "一起看向窗外那道光", sizes: ["full", "knee"], people: "group", dims: { mood: ["安静"], stance: ["站"], focus: ["全身"], prop: ["无"], scene: ["窗边"] } },
  { id: "sp-close-eye", name: "闭眼特写", steps: ["闭眼", "表情放松", "头微侧"], cues: { weight: "任意", hands: "可入画轻触脸", gaze: "闭眼", pitfalls: "眉头紧皱" }, guide: "闭眼，感受脸上的光", sizes: ["close", "xclose"], people: "1", dims: { mood: ["温柔", "放松"], stance: ["站"], focus: ["脸"], prop: ["无"], scene: ["窗边"] } },
];
