/**
 * Unified Grade Configuration & Visibility Helper
 * Manages subject-level visibility toggles and configurable quiz max scores.
 * All configurations are cleanly persisted inside public.subjects.excluded_students.
 */

export const DEFAULT_VISIBILITY = {
  showQuiz1: true,
  showQuiz2: true,
  showProject: true,
  showAttendanceScore: true,
  showTotal: true,
  showAttendanceTab: true
};

export const DEFAULT_MAX_SCORES = {
  quiz_1: 5,
  quiz_2: 5,
  project: 10,
  attendance_score: 5
};

/**
 * Parses visibility settings and max scores from a list of subjects.
 * Strictly isolates each subject's own configuration without cross-subject contamination.
 */
export function parseGradeConfigs(subList) {
  const visibility = { global: { ...DEFAULT_VISIBILITY } };
  const maxScores = { global: { ...DEFAULT_MAX_SCORES } };
  const colLabels = {};
  const customColsMap = new Map();

  if (!Array.isArray(subList)) {
    return { visibility, maxScores, colLabels, customColumns: [] };
  }

  for (const sub of subList) {
    if (!sub || !sub.id || !Array.isArray(sub.excluded_students)) continue;

    const subId = sub.id;
    let subVis = null;
    let subMax = null;

    for (const item of sub.excluded_students) {
      if (typeof item !== 'string') continue;

      // 1. Isolated Subject Visibility Tag (Highest Priority)
      if (item.startsWith('CONFIG_VIS_SUB:')) {
        try {
          const parsed = JSON.parse(item.replace('CONFIG_VIS_SUB:', ''));
          if (parsed && typeof parsed === 'object') {
            const extracted = parsed[subId] || parsed;
            subVis = { ...(subVis || DEFAULT_VISIBILITY), ...extracted };
          }
        } catch (_) {}
      }

      // 2. Configurable Max Scores Tag (per-subject quiz / project max marks)
      else if (item.startsWith('CONFIG_MAX_SCORES:')) {
        try {
          const parsed = JSON.parse(item.replace('CONFIG_MAX_SCORES:', ''));
          if (parsed && typeof parsed === 'object') {
            const extracted = parsed[subId] || parsed;
            subMax = { ...(subMax || DEFAULT_MAX_SCORES), ...extracted };
          }
        } catch (_) {}
      }

      // 3. Custom Grade Columns
      else if (item.startsWith('CONFIG_CUSTOM_COLS:')) {
        try {
          const cols = JSON.parse(item.replace('CONFIG_CUSTOM_COLS:', ''));
          if (Array.isArray(cols)) {
            cols.forEach(c => {
              if (c && c.id) customColsMap.set(c.id, c);
            });
          }
        } catch (_) {}
      }

      // 4. Custom Column Labels
      else if (item.startsWith('CONFIG_COL_LABELS:')) {
        try {
          const lbls = JSON.parse(item.replace('CONFIG_COL_LABELS:', ''));
          if (lbls && typeof lbls === 'object') {
            Object.assign(colLabels, lbls);
          }
        } catch (_) {}
      }

      // 5. Global Config (Legacy fallback)
      else if (item.startsWith('CONFIG:')) {
        try {
          const glob = JSON.parse(item.replace('CONFIG:', ''));
          if (glob && typeof glob === 'object') {
            visibility.global = { ...visibility.global, ...glob };
          }
        } catch (_) {}
      }

      // 6. Legacy CONFIG_SUB fallback (only apply if subVis not yet set)
      else if (item.startsWith('CONFIG_SUB:')) {
        try {
          const parsed = JSON.parse(item.replace('CONFIG_SUB:', ''));
          if (parsed && typeof parsed === 'object') {
            if (parsed[subId] && !subVis) {
              subVis = { ...DEFAULT_VISIBILITY, ...parsed[subId] };
            }
            if (parsed.global && !visibility.global) {
              visibility.global = { ...DEFAULT_VISIBILITY, ...parsed.global };
            }
          }
        } catch (_) {}
      }
    }

    if (subVis) {
      visibility[subId] = subVis;
    }
    if (subMax) {
      maxScores[subId] = subMax;
    }
  }

  return {
    visibility,
    maxScores,
    colLabels,
    customColumns: Array.from(customColsMap.values())
  };
}

/**
 * Gets effective visibility for a specific subject
 */
export function getSubjectVisibility(visibilityState, subId) {
  if (!visibilityState) return { ...DEFAULT_VISIBILITY };
  const globalVis = visibilityState.global || {};
  const subVis = subId ? (visibilityState[subId] || {}) : {};
  return {
    ...DEFAULT_VISIBILITY,
    ...globalVis,
    ...subVis
  };
}

/**
 * Gets effective max scores for a specific subject
 */
export function getSubjectMaxScores(maxScoresState, subId) {
  if (!maxScoresState) return { ...DEFAULT_MAX_SCORES };
  const globalMax = maxScoresState.global || {};
  const subMax = subId ? (maxScoresState[subId] || {}) : {};
  return {
    ...DEFAULT_MAX_SCORES,
    ...globalMax,
    ...subMax
  };
}

/**
 * Safely updates subject configuration (visibility, maxScores, customColumns)
 * without deleting other tags (like dates, section TAs, etc.)
 */
export async function saveSubjectGradeConfig(supabase, subjectId, options = {}) {
  const {
    visibility = null,
    maxScores = null,
    customColumns = null,
    colLabels = null
  } = options;

  if (!subjectId || subjectId === 'global') {
    throw new Error('Specific subject ID required for isolated grade configuration');
  }

  // 1. Fetch current subject record
  const { data: targetSub, error: fetchErr } = await supabase
    .from('subjects')
    .select('id, excluded_students')
    .eq('id', subjectId)
    .single();

  if (fetchErr || !targetSub) {
    throw new Error(fetchErr?.message || 'Subject not found');
  }

  const existing = Array.isArray(targetSub.excluded_students) ? targetSub.excluded_students : [];

  // 2. Remove old occurrences of configs being updated
  const cleanList = existing.filter(x => {
    if (typeof x !== 'string') return true;
    if (visibility !== null && (x.startsWith('CONFIG_VIS_SUB:') || x.startsWith('CONFIG_SUB:'))) return false;
    if (maxScores !== null && x.startsWith('CONFIG_MAX_SCORES:')) return false;
    if (customColumns !== null && x.startsWith('CONFIG_CUSTOM_COLS:')) return false;
    if (colLabels !== null && x.startsWith('CONFIG_COL_LABELS:')) return false;
    return true;
  });

  // 3. Append updated config strings
  if (visibility !== null) {
    cleanList.push('CONFIG_VIS_SUB:' + JSON.stringify(visibility));
  }
  if (maxScores !== null) {
    cleanList.push('CONFIG_MAX_SCORES:' + JSON.stringify(maxScores));
  }
  if (customColumns !== null) {
    cleanList.push('CONFIG_CUSTOM_COLS:' + JSON.stringify(customColumns));
  }
  if (colLabels !== null) {
    cleanList.push('CONFIG_COL_LABELS:' + JSON.stringify(colLabels));
  }

  // 4. Update database
  const { error: updateErr } = await supabase
    .from('subjects')
    .update({ excluded_students: cleanList })
    .eq('id', subjectId);

  if (updateErr) {
    throw updateErr;
  }

  return cleanList;
}
