import type { PrismaService } from '../prisma/prisma.service.js';

interface CategoryRow {
  id: string;
  parentId: string | null;
}

/** Kategoriya va uning barcha avlodlari id'lari (kategoriyalar soni kam — xotirada hisoblaymiz) */
export async function categoryWithDescendants(prisma: PrismaService, rootId: string): Promise<string[]> {
  const rows: CategoryRow[] = await prisma.category.findMany({ select: { id: true, parentId: true } });
  return collectDescendants(rows, rootId);
}

export function collectDescendants(rows: readonly CategoryRow[], rootId: string): string[] {
  const children = new Map<string, string[]>();
  for (const r of rows) {
    if (!r.parentId) continue;
    children.set(r.parentId, [...(children.get(r.parentId) ?? []), r.id]);
  }
  const result: string[] = [];
  const stack = [rootId];
  while (stack.length) {
    const id = stack.pop()!;
    if (result.includes(id)) continue;
    result.push(id);
    stack.push(...(children.get(id) ?? []));
  }
  return result;
}

/** parentId'ni o'zgartirish sikl hosil qilmasligi kerak */
export function wouldCreateCycle(rows: readonly CategoryRow[], id: string, newParentId: string | null): boolean {
  return newParentId !== null && collectDescendants(rows, id).includes(newParentId);
}

export interface TreeNode<T> {
  children: (T & TreeNode<T>)[];
}

export function buildTree<T extends CategoryRow>(rows: readonly T[]): (T & TreeNode<T>)[] {
  const nodes = new Map(rows.map((r) => [r.id, { ...r, children: [] } as T & TreeNode<T>]));
  const roots: (T & TreeNode<T>)[] = [];
  for (const node of nodes.values()) {
    const parent = node.parentId ? nodes.get(node.parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}
