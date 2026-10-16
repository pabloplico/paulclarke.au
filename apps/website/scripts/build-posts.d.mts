export interface BuiltPost {
  slug: string;
  title: string;
  date: string;
  excerpt: string;
  tags: string[];
  content: string;
}

export function parseFrontmatter(raw: string): {
  data: Record<string, string | string[]>;
  content: string;
};

export function readPosts(dir?: string): BuiltPost[];
