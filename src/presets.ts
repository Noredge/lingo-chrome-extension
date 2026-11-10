export type RewritePreset = { id: string; name: string; instruction: string };
export type PresetState = { version: 1; revision: number; items: RewritePreset[] };
export const MAX_PRESETS = 20;
export const emptyPresets = (): PresetState => ({ version: 1, revision: 0, items: [] });
const validId = (id: unknown): id is string => typeof id === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(id);
function fields(name: unknown, instruction: unknown) {
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 32) throw new Error('预设名称需要 1–32 个字符。');
  if (typeof instruction !== 'string' || !instruction.trim() || instruction.trim().length > 1000) throw new Error('修改要求需要 1–1,000 个字符。');
  return { name: name.trim(), instruction: instruction.trim() };
}
export function readPresets(value: unknown): PresetState {
  if (value === undefined) return emptyPresets();
  const state = value as PresetState;
  try {
    if (!state || state.version !== 1 || !Number.isSafeInteger(state.revision) || state.revision < 0 || !Array.isArray(state.items) || state.items.length > MAX_PRESETS) throw 0;
    const ids = new Set<string>(), names = new Set<string>();
    const items = state.items.map(p => {
      if (!p || !validId(p.id) || ids.has(p.id)) throw 0;
      const f = fields(p.name, p.instruction), name = f.name.toLowerCase();
      if (names.has(name)) throw 0;
      ids.add(p.id); names.add(name); return {id:p.id,...f};
    });
    return {version:1,revision:state.revision,items};
  } catch { throw new Error('本机预设数据无法读取，未覆盖原有数据。'); }
}
export type PresetAction = { revision: number; action: 'save' | 'delete' | 'move'; id?: string; name?: string; instruction?: string; direction?: number };
export function updatePresets(state: PresetState, action: PresetAction, newId: string): PresetState {
  if (!action || action.revision !== state.revision) throw new Error('预设已在其他窗口更新，请取消编辑后重试。');
  if (state.revision >= Number.MAX_SAFE_INTEGER) throw new Error('本机预设数据无法读取，未覆盖原有数据。');
  const items = state.items.map(p => ({...p}));
  const index = action.id === undefined ? -1 : items.findIndex(p => p.id === action.id);
  if (action.id !== undefined && (!validId(action.id) || index < 0)) throw new Error('找不到这个预设，请重新选择。');
  if (action.action === 'save') {
    const f = fields(action.name, action.instruction);
    if (items.some(p => p.id !== action.id && p.name.toLowerCase() === f.name.toLowerCase())) throw new Error('已存在同名预设，请换一个名称。');
    if (index >= 0) items[index] = {...items[index],...f};
    else {
      if (items.length >= MAX_PRESETS) throw new Error('最多保存 20 个自定义预设。');
      if (!validId(newId) || items.some(p=>p.id===newId)) throw new Error('无法创建预设，请重试。');
      items.push({id:newId,...f});
    }
  } else if (action.action === 'delete') {
    if (index < 0) throw new Error('找不到这个预设，请重新选择。');
    items.splice(index,1);
  } else if (action.action === 'move') {
    if (index < 0 || ![-1,1].includes(action.direction!)) throw new Error('无效的预设排序。');
    const next = index + action.direction!;
    if (next < 0 || next >= items.length) throw new Error('无效的预设排序。');
    [items[index],items[next]] = [items[next],items[index]];
  } else throw new Error('未知操作。');
  return {version:1,revision:state.revision+1,items};
}
