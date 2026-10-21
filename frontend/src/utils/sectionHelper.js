/**
 * Unified Section & TA Mapping Helper
 * Ensures consistent section-specific Teaching Assistant resolution
 * across Admin Dashboard, Overview, Student Dashboard, Reports, and PDF generation.
 */

export const normalizeSection = (sec) => {
  if (!sec) return 'S1';
  const s = sec.toString().trim().toUpperCase().replace(/\s+/g, '');
  const match = s.match(/(\d+)/);
  if (match) return 'S' + parseInt(match[1], 10);
  return 'S1';
};

/**
 * Normalizes Arabic names to handle various spelling differences,
 * removing honorifics (م/, د/, eng) and normalizing alef, teh marbuta, etc.
 */
export const normalizeArabicName = (str = '') => {
  return str
    .toString()
    .toLowerCase()
    .trim()
    .replace(/^م\s*\/\s*/, '')
    .replace(/^eng\s*\.?\s*/i, '')
    .replace(/^د\s*\/\s*/, '')
    .replace(/^dr\s*\.?\s*/i, '')
    .replace(/^أ\s*\/\s*/, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[\u064B-\u065F]/g, '') // remove tashkeel
    .replace(/\s+/g, ' ');
};

/**
 * Intelligent TA matcher that resolves an instructor by name, ID, or Arabic/English alias.
 */
export const matchInstructor = (query, instructorsList = []) => {
  if (!query || !Array.isArray(instructorsList) || instructorsList.length === 0) return null;
  const qStr = query.toString().trim().toLowerCase();
  const qNorm = normalizeArabicName(qStr);
  const isAbdelrahmanQuery = /عبد\s*الرحمن|عبدالرحمن|abdelrahman|abdurrahman|abdulrahman/i.test(qStr);

  // 1. Direct match on user_id
  const directId = instructorsList.find(i => (i.user_id || '').toLowerCase() === qStr);
  if (directId) return directId;

  // 2. Direct match on name
  const directName = instructorsList.find(i => (i.name || '').toLowerCase() === qStr);
  if (directName) return directName;

  // 3. Normalized Arabic / Alias Matching
  for (const inst of instructorsList) {
    const iNameNorm = normalizeArabicName(inst.name || '');
    const iIdNorm = (inst.user_id || '').toLowerCase();

    // Direct normalized match
    if (iNameNorm === qNorm) return inst;
    if (iNameNorm && (iNameNorm.includes(qNorm) || qNorm.includes(iNameNorm))) {
      return inst;
    }

    // Abdelrahman aliases (handles Abdelrahman Mahmoud / amahmoud... / admin)
    const isAbdelrahmanInst = /عبد\s*الرحمن|عبدالرحمن|abdelrahman|abdurrahman|abdulrahman/i.test(inst.name || '') ||
                              iIdNorm === 'admin';
    if (isAbdelrahmanQuery && isAbdelrahmanInst) {
      return inst;
    }

    // Mostafa aliases (handles Mostafa Abubakr / مصطفى أبو بكر)
    const isMostafaQuery = /مصطف[يى]|mostafa|mustafa|ابو\s*بكر|ابوبكر|abubakr/i.test(qStr);
    const isMostafaInst = /مصطف[يى]|mostafa|mustafa|ابو\s*بكر|ابوبكر|abubakr/i.test(inst.name || '') ||
                          /ابو\s*بكر|ابوبكر|abubakr/i.test(iIdNorm);
    if (isMostafaQuery && isMostafaInst) {
      return inst;
    }
  }

  return null;
};

/**
 * Extracts section-to-TA mapping directly from subject.excluded_students metadata.
 */
export const extractSubjectSectionTAMapFromExcluded = (sub) => {
  const secMap = {};
  if (!sub || !Array.isArray(sub.excluded_students)) return secMap;

  // Check CONFIG_SECTION_TAS JSON first
  const configEntry = sub.excluded_students.find(
    (e) => typeof e === 'string' && e.startsWith('CONFIG_SECTION_TAS:')
  );
  if (configEntry) {
    try {
      const parsed = JSON.parse(configEntry.replace('CONFIG_SECTION_TAS:', ''));
      if (parsed && typeof parsed === 'object') {
        Object.keys(parsed).forEach((k) => {
          if (parsed[k]) secMap[normalizeSection(k)] = parsed[k];
        });
      }
    } catch (e) {}
  }

  // Check individual TA_S<num>: tags (override if explicit)
  sub.excluded_students.forEach((entry) => {
    if (typeof entry === 'string' && /^TA_S\d+:/.test(entry)) {
      const parts = entry.split(':');
      const sec = normalizeSection(parts[0].replace('TA_', ''));
      const ta = parts.slice(1).join(':').trim();
      if (sec && ta) secMap[sec] = ta;
    }
  });

  return secMap;
};

/**
 * Resolves the teaching assistant (معيد) name for a specific subject and section.
 * Priority hierarchy:
 * 1. currentUser.assigned_subjects (student's private assignment holding `<subId>:<sec>:<taName>`)
 * 2. subject.excluded_students (TA_<sec>: tags or CONFIG_SECTION_TAS)
 * 3. allAdmins list assigned_subjects match
 * 4. subject.instructor_name
 * 5. 'المدير الرئيسي'
 */
export const getSectionInstructorName = (subOrId, sec, allAdmins = [], subjectsList = [], currentUser = null) => {
  const secNorm = normalizeSection(sec || 'S1');

  let subObj = null;
  let subId = null;

  if (typeof subOrId === 'object' && subOrId !== null) {
    subObj = subOrId;
    subId = subOrId.id;
  } else if (typeof subOrId === 'string') {
    subId = subOrId;
    if (Array.isArray(subjectsList)) {
      subObj = subjectsList.find((s) => s.id === subId);
    }
  }

  // 1. Search in allAdmins list FIRST (Canonical live truth from database)
  // If an admin or TA has their name updated in users, it immediately reflects here!
  if (subId && Array.isArray(allAdmins) && allAdmins.length > 0) {
    const liveAdmin = allAdmins.find(adm => 
      Array.isArray(adm.assigned_subjects) &&
      adm.assigned_subjects.includes(subId + ':' + secNorm)
    );
    if (liveAdmin && (liveAdmin.name || liveAdmin.user_id)) {
      return liveAdmin.name || liveAdmin.user_id;
    }
  }

  // 2. Check currentUser.assigned_subjects if available
  if (currentUser && Array.isArray(currentUser.assigned_subjects) && subId) {
    const directMatch = currentUser.assigned_subjects.find(
      (e) => typeof e === 'string' && (e.startsWith(subId + ':' + secNorm + ':') || e.startsWith(subId + ':'))
    );
    if (directMatch) {
      const parts = directMatch.split(':');
      if (parts.length >= 3 && parts[2]?.trim()) {
        return parts[2].trim();
      }
    }
  }

  // 3. Check subject.excluded_students metadata
  if (subObj && Array.isArray(subObj.excluded_students)) {
    // 3a. Direct section tag
    const directTagPrefix = 'TA_' + secNorm + ':';
    const directEntry = subObj.excluded_students.find(
      (e) => typeof e === 'string' && e.startsWith(directTagPrefix)
    );
    if (directEntry) {
      const val = directEntry.replace(directTagPrefix, '').trim();
      if (val) return val;
    }

    // 3b. CONFIG_SECTION_TAS JSON map
    const configEntry = subObj.excluded_students.find(
      (e) => typeof e === 'string' && e.startsWith('CONFIG_SECTION_TAS:')
    );
    if (configEntry) {
      try {
        const parsed = JSON.parse(configEntry.replace('CONFIG_SECTION_TAS:', ''));
        if (parsed && (parsed[secNorm] || parsed[sec])) {
          return parsed[secNorm] || parsed[sec];
        }
      } catch (e) {}
    }
  }

  // 4. Fallback to general admin assignment for the whole subject
  if (subId && Array.isArray(allAdmins) && allAdmins.length > 0) {
    for (const adm of allAdmins) {
      if (
        Array.isArray(adm.assigned_subjects) &&
        adm.assigned_subjects.includes(subId)
      ) {
        return adm.name || adm.user_id;
      }
    }
  }

  // 5. Fallback to main instructor_name on subject
  if (subObj?.instructor_name) {
    return subObj.instructor_name;
  }

  return 'المدير الرئيسي';
};

/**
 * Computes the section-to-TA mapping for a single subject from allAdmins.
 * Returns an object like: { S1: "Mostafa Abubakr", S2: "Abdelrahman Mahmoud", ... }
 */
export const buildSubjectSectionTAMap = (subId, allAdmins = []) => {
  const secMap = {};
  if (!subId || !Array.isArray(allAdmins)) return secMap;

  allAdmins.forEach((adm) => {
    if (Array.isArray(adm.assigned_subjects)) {
      adm.assigned_subjects.forEach((entry) => {
        if (typeof entry === 'string' && entry.startsWith(subId + ':')) {
          const parts = entry.split(':');
          if (parts[1]) {
            const sec = normalizeSection(parts[1]);
            secMap[sec] = adm.name || adm.user_id;
          }
        }
      });
    }
  });

  return secMap;
};

/**
 * Builds updated excluded_students array containing latest section TA configurations.
 */
export const embedSectionTAsIntoExcludedStudents = (currentExcluded = [], secMap = {}) => {
  const cur = Array.isArray(currentExcluded) ? [...currentExcluded] : [];

  // Remove previous CONFIG_SECTION_TAS and any TA_S<num>: tags
  const filtered = cur.filter(
    (e) =>
      typeof e !== 'string' ||
      (!e.startsWith('CONFIG_SECTION_TAS:') && !/^TA_S\d+:/.test(e))
  );

  const secKeys = Object.keys(secMap).filter(k => Boolean(secMap[k]));
  if (secKeys.length === 0) return filtered;

  // Add JSON config
  filtered.push('CONFIG_SECTION_TAS:' + JSON.stringify(secMap));

  // Add individual tags for fastest prefix lookups
  secKeys.forEach((sec) => {
    if (secMap[sec]) {
      filtered.push('TA_' + normalizeSection(sec) + ':' + secMap[sec]);
    }
  });

  return filtered;
};

/**
 * Cleans any conflicting section assignments across instructors and strictly assigns
 * each section to its designated instructor in users.assigned_subjects AND subjects.excluded_students.
 */
export const cleanAndAssignSubjectSections = async ({
  subjectId,
  sectionInstructors = {}, // { 'S1': 'user_id_1', 'S2': 'user_id_2' }
  generalInstructorId = null,
  instructorsList = [],
  subjectsList = [],
  supabaseClient
}) => {
  if (!subjectId || !supabaseClient) return;

  const targetSub = Array.isArray(subjectsList) ? subjectsList.find(s => s.id === subjectId) : null;
  let currentExcluded = Array.isArray(targetSub?.excluded_students) ? targetSub.excluded_students : [];

  if (currentExcluded.length === 0) {
    try {
      const { data: dbSub } = await supabaseClient.from('subjects').select('excluded_students').eq('id', subjectId).single();
      if (dbSub && Array.isArray(dbSub.excluded_students)) {
        currentExcluded = dbSub.excluded_students;
      }
    } catch (e) {}
  }

  const secNameMap = {};
  const userUpdates = [];

  // 1. Update each instructor in instructorsList without conflict
  for (const inst of instructorsList) {
    const currentAssigned = Array.isArray(inst.assigned_subjects) ? inst.assigned_subjects : [];
    const filtered = currentAssigned.filter(e => e !== subjectId && !e.startsWith(subjectId + ':'));

    const newEntries = [];

    // General instructor
    if (generalInstructorId && (generalInstructorId === inst.user_id || generalInstructorId === inst.id)) {
      newEntries.push(subjectId);
    }

    // Sections explicitly assigned to this instructor
    Object.keys(sectionInstructors).forEach((sec) => {
      const assignedId = sectionInstructors[sec];
      if (assignedId && (assignedId === inst.user_id || assignedId === inst.id)) {
        newEntries.push(subjectId + ':' + normalizeSection(sec));
      }
    });

    const updated = [...new Set([...filtered, ...newEntries])];
    inst.assigned_subjects = updated;

    // Only update if changes occurred
    if (JSON.stringify(currentAssigned) !== JSON.stringify(updated)) {
      const query = inst.id 
        ? supabaseClient.from('users').update({ assigned_subjects: updated }).eq('id', inst.id)
        : supabaseClient.from('users').update({ assigned_subjects: updated }).eq('user_id', inst.user_id);
      userUpdates.push(query);
    }
  }

  // 2. Build human-readable section TA name mapping
  Object.keys(sectionInstructors).forEach((sec) => {
    const secNorm = normalizeSection(sec);
    const assignedId = sectionInstructors[sec];
    if (!assignedId) return;

    const matchedInst = instructorsList.find(i => i.user_id === assignedId || i.id === assignedId);
    if (matchedInst) {
      secNameMap[secNorm] = matchedInst.name || matchedInst.user_id;
    } else if (assignedId === 'admin') {
      secNameMap[secNorm] = 'المدير الرئيسي';
    } else {
      secNameMap[secNorm] = assignedId;
    }
  });

  // 3. Embed into subject.excluded_students
  const updatedExcluded = embedSectionTAsIntoExcludedStudents(currentExcluded, secNameMap);
  const subjectUpdatePromise = supabaseClient
    .from('subjects')
    .update({ excluded_students: updatedExcluded })
    .eq('id', subjectId);

  try {
    await Promise.all([...userUpdates, subjectUpdatePromise]);
  } catch (err) {
    console.warn('cleanAndAssignSubjectSections notice:', err);
  }
  return { secNameMap, updatedExcluded };
};

/**
 * Automatically synchronizes section TAs into all subjects' excluded_students.
 * Preserves existing distinct section assignments and prevents a single greedy admin from wiping others out.
 */
export const syncAllSubjectsSectionTAs = async (allSubjects = [], allAdmins = [], supabaseClient) => {
  if (!Array.isArray(allSubjects) || !Array.isArray(allAdmins) || !supabaseClient) {
    return { updatedCount: 0, details: [] };
  }

  const updates = [];
  const details = [];

  for (const sub of allSubjects) {
    const currentExcluded = Array.isArray(sub.excluded_students) ? sub.excluded_students : [];
    const secMapFromExcluded = extractSubjectSectionTAMapFromExcluded(sub);
    const secMapFromAdmins = buildSubjectSectionTAMap(sub.id, allAdmins);

    // If excluded_students already contains distinct section TAs, prioritize it!
    const excludedValues = Object.values(secMapFromExcluded).filter(Boolean);
    const hasDistinctExcludedTAs = new Set(excludedValues).size > 1;

    let finalSecMap = {};
    if (hasDistinctExcludedTAs || (Object.keys(secMapFromExcluded).length > 0 && Object.keys(secMapFromAdmins).length === 0)) {
      finalSecMap = { ...secMapFromExcluded };
    } else {
      finalSecMap = { ...secMapFromAdmins, ...secMapFromExcluded };
    }

    if (Object.keys(finalSecMap).length === 0) continue;

    const expectedConfig = 'CONFIG_SECTION_TAS:' + JSON.stringify(finalSecMap);
    const hasCurrentConfig = currentExcluded.includes(expectedConfig);
    const allTagsExist = Object.keys(finalSecMap).every((sec) =>
      currentExcluded.includes('TA_' + normalizeSection(sec) + ':' + finalSecMap[sec])
    );

    if (hasCurrentConfig && allTagsExist) {
      continue;
    }

    const updatedExcluded = embedSectionTAsIntoExcludedStudents(currentExcluded, finalSecMap);
    sub.excluded_students = updatedExcluded;

    updates.push(
      supabaseClient
        .from('subjects')
        .update({ excluded_students: updatedExcluded })
        .eq('id', sub.id)
    );

    details.push({
      subjectId: sub.id,
      subjectName: sub.name,
      sections: finalSecMap
    });
  }

  if (updates.length > 0) {
    await Promise.all(updates);
  }

  return {
    updatedCount: updates.length,
    details
  };
};
