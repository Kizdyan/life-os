import type { ActionRequest } from "./types";

export interface SkillContext {
  now: string;
  memories: Record<string, unknown>;
}

export interface Skill {
  id: string;
  description: string;
  plan(input: unknown, context: SkillContext): Promise<ActionRequest[]>;
}

export class SkillRegistry {
  private readonly skills = new Map<string, Skill>();

  register(skill: Skill): void {
    if (this.skills.has(skill.id)) throw new Error(`Skill already registered: ${skill.id}`);
    this.skills.set(skill.id, skill);
  }

  get(id: string): Skill {
    const skill = this.skills.get(id);
    if (!skill) throw new Error(`Unknown skill: ${id}`);
    return skill;
  }
}
