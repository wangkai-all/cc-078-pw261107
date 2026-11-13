/**
 * 领域模型：考试数据分析台
 * 所有考生标识均为虚构匿名编号，不包含真实身份信息。
 */

/** 逻辑题目（跨试卷版本共享同一题目 ID） */
export interface Question {
  id: string; // 如 'Q01'
  title: string; // 题干摘要
  knowledge: string; // 知识点标签
  type: 'single'; // 目前支持单选
}

/**
 * 评分规则修订。
 * 同一题目在同一试卷版本中可能有多次修订（改选项、改答案、改分值），
 * 统计时按答题提交时间匹配当时生效的修订（按当时版本计算）。
 */
export interface RuleRevision {
  effectiveFrom: string; // ISO 时间，该规则自此生效
  options: string[]; // 有效选项 key，如 ['A','B','C','D']
  optionLabels: Record<string, string>; // key -> 选项文本
  correct: string[]; // 正确选项 key
  score: number; // 满分分值
  note?: string; // 修订说明
}

/** 题目在某试卷版本中的配置 */
export interface PaperQuestion {
  questionId: string;
  position: number; // 在该试卷中的题号（1-based）
  rules: RuleRevision[]; // 按 effectiveFrom 升序
}

/** 试卷版本 */
export interface PaperVersion {
  id: string; // 如 'v1'
  name: string; // 如 '2026 春季·A 卷'
  questions: PaperQuestion[];
}

/** 考生（虚构） */
export interface Candidate {
  id: string; // 匿名编号，如 'S-0001'
  group: string; // 考生群体，如 '甲班'
}

/** 答题记录 */
export interface Response {
  id: string;
  candidateId: string;
  paperVersion: string;
  questionId: string;
  answer: string[]; // 所选选项 key；空数组 = 空答
  submittedAt: string; // ISO 提交时间
  source: 'initial' | 'backfill'; // 补录标记
}

/** 完整数据集 */
export interface Dataset {
  questions: Question[];
  paperVersions: PaperVersion[];
  candidates: Candidate[];
  responses: Response[];
}

/** 数据质量：无效答题（选项不在当时版本有效范围内等） */
export interface InvalidIssue {
  kind: 'invalid';
  responseId: string;
  candidateId: string;
  questionId: string;
  paperVersion: string;
  answer: string[];
  reason: string;
}

/** 数据质量：缺失题目（试卷要求作答但无任何记录；或记录引用了不存在的题目） */
export interface MissingIssue {
  kind: 'missing';
  candidateId?: string;
  questionId: string;
  paperVersion: string;
  reason: string;
}

/** 数据质量：重复提交（同一考生同一题同一版本多条记录，取最新，其余标记） */
export interface DuplicateIssue {
  kind: 'duplicate';
  keptResponseId: string;
  droppedResponseId: string;
  candidateId: string;
  questionId: string;
  paperVersion: string;
}

export type QualityIssue = InvalidIssue | MissingIssue | DuplicateIssue;

export interface QualityReport {
  invalid: InvalidIssue[];
  missing: MissingIssue[];
  duplicate: DuplicateIssue[];
}

/** 统计桶：按 题目 × 试卷版本 × 群体 聚合的累加器 */
export interface Bucket {
  questionId: string;
  paperVersion: string;
  group: string; // 'ALL' 表示全体
  valid: number; // 有效作答数（不含无效/重复/缺失）
  blank: number; // 空答数
  correct: number; // 答对数（按当时版本规则判定）
  invalid: number; // 无效作答数（单独统计，不计入 valid）
  optionCounts: Record<string, number>; // 各选项被选次数（仅有效非空作答）
  scoreSum: number; // 得分合计
  responseIds: string[]; // 溯源：构成该桶的原始记录 ID
}

export const bucketKey = (questionId: string, paperVersion: string, group: string) =>
  `${questionId}|${paperVersion}|${group}`;

/** 补录审计：一次补录只触动受影响的统计桶 */
export interface BackfillAudit {
  id: string;
  appliedAt: string;
  note: string;
  responseCount: number;
  affectedBuckets: string[]; // 被更新的桶 key
  superseded: number; // 被新记录顶替的旧记录数
  duplicatesIgnored: number; // 因更晚记录已存在而被忽略的条数
}

/** 题目 × 版本 的派生统计（从 Bucket 计算） */
export interface QuestionVersionStats {
  questionId: string;
  paperVersion: string;
  group: string;
  valid: number;
  blank: number;
  correct: number;
  invalid: number;
  correctRate: number | null; // correct / valid；valid=0 时为 null
  blankRate: number | null;
  avgScore: number | null;
  optionCounts: Record<string, number>;
  responseIds: string[];
}
