// ==========================================================================
// Madrid Travel Itinerary — Interactive Client Logic (Custom Stops + Mobile UX)
// ==========================================================================

(() => {
  const VISITED_STORAGE_KEY = 'madrid_visited_stops_v1';
  const NOTES_STORAGE_KEY = 'madrid_stop_notes_v1';
  const CUSTOM_STOPS_STORAGE_KEY = 'madrid_custom_stops_v1';

  const CATEGORY_LABELS = {
    sight: 'Αξιοθέατα & Πλατείες',
    food: 'Γαστρονομία & Tapas',
    museum: 'Μουσεία & Τέχνη',
    neighborhood: 'Συνοικία & Βόλτα',
    excursion: 'Ημερήσια Εκδρομή'
  };

  const dayTabs = Array.from(document.querySelectorAll('[data-day-filter]'));
  const daySections = Array.from(document.querySelectorAll('.day-section'));

  const searchInput = document.getElementById('search-stops');
  const categorySelect = document.getElementById('category-filter');
  const emptyState = document.getElementById('empty-filter-state');
  const clearFiltersBtn = document.getElementById('clear-filters-btn');

  const progressBar = document.getElementById('trip-progress-bar');
  const progressCountText = document.getElementById('progress-count-text');
  const resetProgressBtn = document.getElementById('reset-progress-btn');
  const liveStatus = document.getElementById('live-status');

  // Mobile Sidebar Toggle
  const toggleSidebarBtn = document.getElementById('toggle-sidebar-mobile-btn');
  const sidebarCardsWrapper = document.getElementById('sidebar-cards-wrapper');
  const sidebarToggleLabel = document.getElementById('sidebar-toggle-label');

  // Dialogs & Add Activity Form
  const openQuickGuideBtn = document.getElementById('open-quick-guide-btn');
  const quickGuideDialog = document.getElementById('quick-guide-dialog');
  const printBtn = document.getElementById('print-btn');

  const openAddActivityBtn = document.getElementById('open-add-activity-btn');
  const mobileFabAdd = document.getElementById('mobile-fab-add');
  const addDayButtons = Array.from(document.querySelectorAll('[data-add-to-day]'));
  const addActivityDialog = document.getElementById('add-activity-dialog');
  const addActivityForm = document.getElementById('add-activity-form');
  const cancelAddActivityBtn = document.getElementById('cancel-add-activity-btn');

  const daySelectInput = document.getElementById('activity-day');
  const titleInput = document.getElementById('activity-title-input');
  const timeInput = document.getElementById('activity-time-input');
  const categoryInput = document.getElementById('activity-category-input');
  const descInput = document.getElementById('activity-desc-input');
  const mapInput = document.getElementById('activity-map-input');
  const titleError = document.getElementById('title-error');

  const PRIVATE_CODES_STORAGE_KEY = 'madrid_private_codes_v1';
  const CHECK_LABEL_OFF = 'Το είδα';
  const CHECK_LABEL_ON = '✓ Επισκέφθηκα';

  // Trip calendar: day id -> local date (YYYY-MM-DD)
  const TRIP_DATES = {
    'day-1': '2026-11-24',
    'day-2': '2026-11-25',
    'day-3': '2026-11-26',
    'day-4': '2026-11-27',
    'day-5': '2026-11-28',
    'day-6': '2026-11-29'
  };

  // Lowercase + strip accents so "μουσειο" finds "Μουσείο" and "avila" finds "Ávila"
  function normalizeText(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLocaleLowerCase('el');
  }

  function isSafeHttpUrl(value) {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' || url.protocol === 'http:';
    } catch {
      return false;
    }
  }

  // First HH:MM found in a string, as minutes since midnight (or null)
  function parseTimeMinutes(text) {
    const m = String(text || '').match(/(\d{1,2})[:.](\d{2})/);
    if (!m) return null;
    const h = Number(m[1]);
    const min = Number(m[2]);
    if (h > 23 || min > 59) return null;
    return h * 60 + min;
  }

  function getCardTimeMinutes(card) {
    const badge = card.querySelector('.time-badge');
    return badge ? parseTimeMinutes(badge.textContent) : null;
  }

  // Place a card in its timeline after the last stop whose time is <= its own
  function insertCardByTime(timeline, cardEl, timeText) {
    const t = parseTimeMinutes(timeText);
    if (t === null) {
      timeline.appendChild(cardEl);
      return;
    }
    const cards = Array.from(timeline.querySelectorAll(':scope > .stop-card'));
    const before = cards.find((c) => {
      const ct = getCardTimeMinutes(c);
      return ct !== null && ct > t;
    });
    timeline.insertBefore(cardEl, before || null);
  }

  let activeDayFilter = 'all';
  let visitedSet = new Set();
  let notesMap = {};
  let customStops = [];

  // Query all current stop cards (built-in + custom)
  function getAllStopCards() {
    return Array.from(document.querySelectorAll('.stop-card'));
  }

  // Safe localStorage helpers
  function loadState() {
    try {
      const rawVisited = localStorage.getItem(VISITED_STORAGE_KEY);
      if (rawVisited) {
        visitedSet = new Set(JSON.parse(rawVisited));
      }
      const rawNotes = localStorage.getItem(NOTES_STORAGE_KEY);
      if (rawNotes) {
        notesMap = JSON.parse(rawNotes) || {};
      }
      const rawCustom = localStorage.getItem(CUSTOM_STOPS_STORAGE_KEY);
      if (rawCustom) {
        customStops = JSON.parse(rawCustom) || [];
      }
    } catch {
      visitedSet = new Set();
      notesMap = {};
      customStops = [];
    }
  }

  function saveVisited() {
    try {
      localStorage.setItem(VISITED_STORAGE_KEY, JSON.stringify(Array.from(visitedSet)));
    } catch {
      // Ignore storage quota errors
    }
  }

  function saveNotes() {
    try {
      localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(notesMap));
    } catch {
      // Ignore storage quota errors
    }
  }

  function saveCustomStops() {
    try {
      localStorage.setItem(CUSTOM_STOPS_STORAGE_KEY, JSON.stringify(customStops));
    } catch {
      // Ignore storage quota errors
    }
  }

  function announce(message) {
    if (!liveStatus) return;
    liveStatus.textContent = message;
  }

  // Build DOM element for a custom user-added activity (safe DOM creation, no innerHTML XSS)
  function createCustomStopElement(stop) {
    const li = document.createElement('li');
    li.className = 'stop-card';
    li.setAttribute('data-stop-id', stop.id);
    li.setAttribute('data-category', stop.category || 'sight');
    li.setAttribute('data-custom-stop', 'true');

    const inner = document.createElement('div');
    inner.className = 'stop-card-inner';

    const headerRow = document.createElement('div');
    headerRow.className = 'stop-header-row';

    const headerLeft = document.createElement('div');
    const badges = document.createElement('div');
    badges.className = 'stop-meta-badges';

    if (stop.time) {
      const timeBadge = document.createElement('span');
      timeBadge.className = 'time-badge';
      timeBadge.textContent = stop.time;
      badges.appendChild(timeBadge);
    }

    const catBadge = document.createElement('span');
    catBadge.className = 'category-badge';
    catBadge.textContent = CATEGORY_LABELS[stop.category] || 'Δραστηριότητα';
    badges.appendChild(catBadge);

    const customBadge = document.createElement('span');
    customBadge.className = 'custom-badge';
    customBadge.textContent = 'Δική μου προσθήκη';
    badges.appendChild(customBadge);

    const h3 = document.createElement('h3');
    h3.className = 'stop-title';
    h3.textContent = stop.title;

    headerLeft.appendChild(badges);
    headerLeft.appendChild(h3);
    headerRow.appendChild(headerLeft);
    inner.appendChild(headerRow);

    if (stop.description) {
      const p = document.createElement('p');
      p.className = 'stop-description';
      p.textContent = stop.description;
      inner.appendChild(p);
    }

    // Actions row (Google Maps link + Check + Delete)
    const actions = document.createElement('div');
    actions.className = 'stop-actions';

    const mapGroup = document.createElement('div');
    mapGroup.className = 'map-links-group';

    const mapLink = document.createElement('a');
    mapLink.className = 'map-link';
    const resolvedMapUrl =
      stop.mapUrl && isSafeHttpUrl(stop.mapUrl.trim())
        ? stop.mapUrl.trim()
        : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(stop.title + ' Madrid')}`;
    mapLink.href = resolvedMapUrl;
    mapLink.target = '_blank';
    mapLink.rel = 'noopener noreferrer';
    mapLink.textContent = `📍 Google Maps: ${stop.title}`;
    mapGroup.appendChild(mapLink);

    const rightBtns = document.createElement('div');
    rightBtns.className = 'stop-right-buttons';

    const checkBtn = document.createElement('button');
    checkBtn.type = 'button';
    checkBtn.className = 'check-btn';
    checkBtn.setAttribute('data-check-for', stop.id);
    checkBtn.setAttribute('aria-pressed', 'false');
    checkBtn.setAttribute('aria-label', `Το είδα: ${stop.title}`);
    checkBtn.textContent = CHECK_LABEL_OFF;
    bindCheckButton(checkBtn);

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'btn-delete-stop';
    deleteBtn.setAttribute('aria-label', `Διαγραφή δραστηριότητας: ${stop.title}`);
    deleteBtn.textContent = 'Διαγραφή';
    deleteBtn.addEventListener('click', () => {
      if (!window.confirm(`Να διαγραφεί η δραστηριότητα «${stop.title}»;`)) return;
      removeCustomStop(stop.id);
    });

    rightBtns.appendChild(checkBtn);
    rightBtns.appendChild(deleteBtn);

    actions.appendChild(mapGroup);
    actions.appendChild(rightBtns);
    inner.appendChild(actions);

    // Personal notes disclosure
    const details = document.createElement('details');
    details.className = 'note-details';
    const summary = document.createElement('summary');
    summary.textContent = `Προσωπικές σημειώσεις για ${stop.title}`;
    const label = document.createElement('label');
    label.className = 'visually-hidden';
    label.setAttribute('for', `note-${stop.id}`);
    label.textContent = `Σημειώσεις για ${stop.title}`;
    const textarea = document.createElement('textarea');
    textarea.id = `note-${stop.id}`;
    textarea.className = 'note-textarea';
    textarea.setAttribute('data-note-for', stop.id);
    textarea.placeholder = 'Προσθέστε σημείωση (αποθηκεύεται αυτόματα)...';
    bindNoteTextarea(textarea);

    details.appendChild(summary);
    details.appendChild(label);
    details.appendChild(textarea);
    inner.appendChild(details);

    li.appendChild(inner);
    return li;
  }

  function renderSavedCustomStops() {
    // Remove previously rendered custom stop DOM nodes first
    document.querySelectorAll('[data-custom-stop="true"]').forEach((el) => el.remove());

    customStops.forEach((stop) => {
      const timeline = document.querySelector(`[data-timeline-for="${stop.day}"]`);
      if (timeline) {
        const el = createCustomStopElement(stop);
        insertCardByTime(timeline, el, stop.time);
      }
    });

    updateDayCounts();
  }

  function updateDayCounts() {
    daySections.forEach((section) => {
      const dayId = section.getAttribute('data-day');
      const countBadge = section.querySelector(`[data-day-count="${dayId}"]`);
      const totalInDay = section.querySelectorAll('.stop-card').length;
      if (countBadge) {
        countBadge.textContent = `${totalInDay} ${totalInDay === 1 ? 'Στάση' : 'Στάσεις'}`;
      }
    });
  }

  function removeCustomStop(stopId) {
    customStops = customStops.filter((s) => s.id !== stopId);
    visitedSet.delete(stopId);
    delete notesMap[stopId];
    saveCustomStops();
    saveVisited();
    saveNotes();

    const node = document.querySelector(`.stop-card[data-stop-id="${stopId}"]`);
    if (node) node.remove();

    updateDayCounts();
    syncVisitedUI();
    applyFilters();
    announce('Η δραστηριότητα διαγράφηκε.');
  }

  // Update visited UI & progress bar
  function syncVisitedUI() {
    const allCards = getAllStopCards();
    const total = allCards.length;

    // Clean up any stale visited IDs that no longer exist
    const validIds = new Set(allCards.map((c) => c.getAttribute('data-stop-id')));
    Array.from(visitedSet).forEach((id) => {
      if (!validIds.has(id)) visitedSet.delete(id);
    });

    const completed = visitedSet.size;

    allCards.forEach((card) => {
      const id = card.getAttribute('data-stop-id');
      const isVisited = visitedSet.has(id);
      card.setAttribute('data-visited', isVisited ? 'true' : 'false');
    });

    document.querySelectorAll('[data-check-for]').forEach((btn) => {
      const id = btn.getAttribute('data-check-for');
      const isVisited = visitedSet.has(id);
      btn.setAttribute('aria-pressed', isVisited ? 'true' : 'false');
      btn.textContent = isVisited ? CHECK_LABEL_ON : CHECK_LABEL_OFF;
    });

    markNextStop();

    if (progressBar) {
      progressBar.max = total;
      progressBar.value = completed;
      const ratio = total > 0 ? completed / total : 0;
      const hue = Math.round(220 - ratio * 75); // Shifts from Royal Blue (220) to Emerald Green (145)
      progressBar.style.setProperty('--brand-hue', String(hue));
    }

    if (progressCountText) {
      progressCountText.textContent = `${completed} / ${total} στάσεις`;
    }
  }

  // Sync saved notes into textareas
  function syncNotesUI() {
    document.querySelectorAll('[data-note-for]').forEach((textarea) => {
      const id = textarea.getAttribute('data-note-for');
      if (notesMap[id]) {
        textarea.value = notesMap[id];
        const details = textarea.closest('details');
        if (details) details.open = true;
      }
    });
  }

  // Filter days & stops based on active tabs, search query, and category
  function applyFilters() {
    const query = normalizeText((searchInput?.value || '').trim());
    const category = categorySelect?.value || 'all';
    let visibleStopsCount = 0;

    daySections.forEach((section) => {
      const dayId = section.getAttribute('data-day');
      const dayMatches = activeDayFilter === 'all' || activeDayFilter === dayId;

      if (!dayMatches) {
        section.hidden = true;
        return;
      }

      const cardsInDay = Array.from(section.querySelectorAll('.stop-card'));
      let visibleInThisDay = 0;

      cardsInDay.forEach((card) => {
        const stopId = card.getAttribute('data-stop-id');
        const stopCategory = card.getAttribute('data-category');
        const textContent = normalizeText(card.textContent);

        const matchesQuery = !query || textContent.includes(query);
        let matchesCategory = true;

        if (category === 'unvisited') {
          matchesCategory = !visitedSet.has(stopId);
        } else if (category !== 'all') {
          matchesCategory = stopCategory === category;
        }

        const isVisible = matchesQuery && matchesCategory;
        card.hidden = !isVisible;
        if (isVisible) {
          visibleInThisDay += 1;
          visibleStopsCount += 1;
        }
      });

      section.hidden = visibleInThisDay === 0;
    });

    if (emptyState) {
      emptyState.hidden = visibleStopsCount > 0;
    }
  }

  function bindCheckButton(btn) {
    btn.addEventListener('click', () => {
      const stopId = btn.getAttribute('data-check-for');
      if (!stopId) return;

      if (visitedSet.has(stopId)) {
        visitedSet.delete(stopId);
        announce('Η στάση αφαιρέθηκε από τις ολοκληρωμένες.');
      } else {
        visitedSet.add(stopId);
        announce('Η στάση σημειώθηκε ως ολοκληρωμένη.');
      }

      saveVisited();
      syncVisitedUI();
      applyFilters();
    });
  }

  function bindNoteTextarea(textarea) {
    textarea.addEventListener('input', () => {
      const stopId = textarea.getAttribute('data-note-for');
      if (!stopId) return;
      const val = textarea.value.trim();
      if (val) {
        notesMap[stopId] = textarea.value;
      } else {
        delete notesMap[stopId];
      }
      saveNotes();
    });
  }

  // Mobile Sidebar Collapse / Expand
  if (toggleSidebarBtn && sidebarCardsWrapper) {
    // Start collapsed on mobile screens so the itinerary is immediately visible
    sidebarCardsWrapper.setAttribute('data-collapsed', 'true');
    toggleSidebarBtn.setAttribute('aria-expanded', 'false');

    toggleSidebarBtn.addEventListener('click', () => {
      const isCollapsed = sidebarCardsWrapper.getAttribute('data-collapsed') === 'true';
      const nextCollapsed = !isCollapsed;
      sidebarCardsWrapper.setAttribute('data-collapsed', nextCollapsed ? 'true' : 'false');
      toggleSidebarBtn.setAttribute('aria-expanded', nextCollapsed ? 'false' : 'true');
      if (sidebarToggleLabel) {
        sidebarToggleLabel.textContent = nextCollapsed ? 'Εμφάνιση' : 'Απόκρυψη';
      }
    });
  }

  // Event Listeners: Day filter buttons
  dayTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      activeDayFilter = tab.getAttribute('data-day-filter') || 'all';
      dayTabs.forEach((t) => {
        t.setAttribute('aria-pressed', t === tab ? 'true' : 'false');
      });
      applyFilters();
    });
  });

  // Event Listeners: Search & Category
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      applyFilters();
    });
  }

  if (categorySelect) {
    categorySelect.addEventListener('change', () => {
      applyFilters();
    });
  }

  if (clearFiltersBtn) {
    clearFiltersBtn.addEventListener('click', () => {
      activeDayFilter = 'all';
      dayTabs.forEach((t) => {
        t.setAttribute('aria-pressed', t.getAttribute('data-day-filter') === 'all' ? 'true' : 'false');
      });
      if (searchInput) searchInput.value = '';
      if (categorySelect) categorySelect.value = 'all';
      applyFilters();
      announce('Τα φίλτρα επαναφέρθηκαν.');
    });
  }

  // Bind built-in check buttons and note textareas
  document.querySelectorAll('[data-check-for]').forEach(bindCheckButton);
  document.querySelectorAll('[data-note-for]').forEach(bindNoteTextarea);

  // Event Listeners: Reset checklist
  if (resetProgressBtn) {
    resetProgressBtn.addEventListener('click', () => {
      if (visitedSet.size === 0) return;
      if (!window.confirm('Να μηδενιστούν όλες οι επισκέψεις που έχετε σημειώσει;')) return;
      visitedSet.clear();
      saveVisited();
      syncVisitedUI();
      applyFilters();
      announce('Το checklist επισκέψεων μηδενίστηκε.');
    });
  }

  // Open Add Activity Dialog helper
  function openAddActivityModal(preferredDay) {
    if (!addActivityDialog) return;
    if (daySelectInput) {
      if (preferredDay && preferredDay !== 'all') {
        daySelectInput.value = preferredDay;
      } else if (activeDayFilter !== 'all') {
        daySelectInput.value = activeDayFilter;
      } else {
        daySelectInput.value = 'day-1';
      }
    }
    if (titleError) titleError.hidden = true;
    addActivityDialog.showModal();
  }

  if (openAddActivityBtn) {
    openAddActivityBtn.addEventListener('click', () => openAddActivityModal());
  }

  if (mobileFabAdd) {
    mobileFabAdd.addEventListener('click', () => openAddActivityModal());
  }

  addDayButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetDay = btn.getAttribute('data-add-to-day');
      openAddActivityModal(targetDay);
    });
  });

  if (cancelAddActivityBtn && addActivityDialog) {
    cancelAddActivityBtn.addEventListener('click', () => {
      addActivityDialog.close();
    });
  }

  // Form validation timing: validate on blur, clear error on input
  if (titleInput && titleError) {
    titleInput.addEventListener('blur', () => {
      if (!titleInput.value.trim()) {
        titleError.hidden = false;
      }
    });
    titleInput.addEventListener('input', () => {
      if (titleInput.value.trim()) {
        titleError.hidden = true;
      }
    });
  }

  // Handle New Activity Form Submission
  if (addActivityForm && addActivityDialog) {
    addActivityForm.addEventListener('submit', (e) => {
      e.preventDefault();

      const titleVal = (titleInput?.value || '').trim();
      if (!titleVal) {
        if (titleError) titleError.hidden = false;
        titleInput?.focus();
        return;
      }

      const newStop = {
        id: `custom-${Date.now()}`,
        day: daySelectInput?.value || 'day-1',
        title: titleVal,
        time: (timeInput?.value || '').trim(),
        category: categoryInput?.value || 'sight',
        description: (descInput?.value || '').trim(),
        mapUrl: isSafeHttpUrl((mapInput?.value || '').trim()) ? (mapInput?.value || '').trim() : ''
      };

      customStops.push(newStop);
      saveCustomStops();

      const timeline = document.querySelector(`[data-timeline-for="${newStop.day}"]`);
      if (timeline) {
        const cardEl = createCustomStopElement(newStop);
        insertCardByTime(timeline, cardEl, newStop.time);
      }

      updateDayCounts();
      syncVisitedUI();
      applyFilters();

      addActivityForm.reset();
      if (titleError) titleError.hidden = true;
      addActivityDialog.close();

      // Scroll to the newly added card smoothly
      const addedCard = document.querySelector(`.stop-card[data-stop-id="${newStop.id}"]`);
      if (addedCard && !addedCard.hidden) {
        addedCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }

      announce(`Η δραστηριότητα «${newStop.title}» προστέθηκε στο πρόγραμμα.`);
    });
  }

  // Event Listeners: Quick Guide Dialog & Print
  if (openQuickGuideBtn && quickGuideDialog) {
    openQuickGuideBtn.addEventListener('click', () => {
      quickGuideDialog.showModal();
    });
  }

  if (printBtn) {
    printBtn.addEventListener('click', () => {
      window.print();
    });
  }

  // ------------------------------------------------------------------
  // "Today" awareness: during the trip open on today's day and flag the
  // next unvisited stop. ?today=2026-11-25 overrides the date for testing.
  // ------------------------------------------------------------------
  function getTodayDayId() {
    let iso = '';
    try {
      iso = new URLSearchParams(window.location.search).get('today') || '';
    } catch {
      iso = '';
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
      const now = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      iso = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    }
    return Object.keys(TRIP_DATES).find((id) => TRIP_DATES[id] === iso) || null;
  }

  const todayDayId = getTodayDayId();

  function markNextStop() {
    document.querySelectorAll('.next-badge').forEach((el) => el.remove());
    document.querySelectorAll('.stop-card[data-next="true"]').forEach((el) => el.removeAttribute('data-next'));
    if (!todayDayId) return;

    const section = document.getElementById(todayDayId);
    if (!section) return;
    const next = Array.from(section.querySelectorAll('.stop-card')).find(
      (card) => !visitedSet.has(card.getAttribute('data-stop-id'))
    );
    if (!next) return;

    next.setAttribute('data-next', 'true');
    const badges = next.querySelector('.stop-meta-badges');
    if (badges) {
      const badge = document.createElement('span');
      badge.className = 'next-badge';
      badge.textContent = 'Επόμενη στάση';
      badges.prepend(badge);
    }
  }

  function applyTodayDefaults() {
    if (!todayDayId) return;
    const tab = dayTabs.find((t) => t.getAttribute('data-day-filter') === todayDayId);
    if (tab) {
      const dateLabel = tab.querySelector('.day-tab-date');
      if (dateLabel) dateLabel.textContent = `Σήμερα · ${dateLabel.textContent}`;
      activeDayFilter = todayDayId;
      dayTabs.forEach((t) => t.setAttribute('aria-pressed', t === tab ? 'true' : 'false'));
      // Bring today's tab into view inside the horizontal strip only (no page jump)
      const strip = tab.closest('.day-tabs-nav');
      if (strip && strip.scrollWidth > strip.clientWidth) {
        strip.scrollLeft = tab.offsetLeft - (strip.clientWidth - tab.offsetWidth) / 2;
      }
    }
    const kicker = document.querySelector(`#${todayDayId} .day-kicker`);
    if (kicker) kicker.textContent = `Σήμερα · ${kicker.textContent}`;
  }

  // ------------------------------------------------------------------
  // Private booking codes: stored only on this device, never in the page
  // ------------------------------------------------------------------
  const privateCodesInput = document.getElementById('private-codes-input');
  if (privateCodesInput) {
    try {
      privateCodesInput.value = localStorage.getItem(PRIVATE_CODES_STORAGE_KEY) || '';
    } catch {
      // storage unavailable: field still works for this session
    }
    privateCodesInput.addEventListener('input', () => {
      try {
        localStorage.setItem(PRIVATE_CODES_STORAGE_KEY, privateCodesInput.value);
      } catch {
        // ignore
      }
    });
  }

  // ------------------------------------------------------------------
  // Backup: export / import notes, visited stops, custom stops, codes
  // ------------------------------------------------------------------
  const exportBtn = document.getElementById('export-btn');
  const importInput = document.getElementById('import-input');

  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      let privateCodes = '';
      try {
        privateCodes = localStorage.getItem(PRIVATE_CODES_STORAGE_KEY) || '';
      } catch {
        privateCodes = '';
      }
      const data = {
        app: 'madrid-trip',
        version: 1,
        exportedAt: new Date().toISOString(),
        visited: Array.from(visitedSet),
        notes: notesMap,
        customStops,
        privateCodes
      };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `madrid-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      announce('Το αντίγραφο ασφαλείας αποθηκεύτηκε.');
    });
  }

  if (importInput) {
    importInput.addEventListener('change', async () => {
      const file = importInput.files && importInput.files[0];
      importInput.value = '';
      if (!file) return;
      try {
        const data = JSON.parse(await file.text());
        if (!data || data.app !== 'madrid-trip') throw new Error('wrong file');
        if (!window.confirm('Να αντικατασταθούν οι τρέχουσες σημειώσεις, επισκέψεις και δικές σας στάσεις με αυτές του αρχείου;')) return;

        visitedSet = new Set(Array.isArray(data.visited) ? data.visited.map(String) : []);
        notesMap = data.notes && typeof data.notes === 'object' ? data.notes : {};
        customStops = Array.isArray(data.customStops)
          ? data.customStops
              .filter((s) => s && typeof s.id === 'string' && typeof s.title === 'string' && TRIP_DATES[s.day])
              .map((s) => ({ ...s, mapUrl: isSafeHttpUrl(s.mapUrl || '') ? s.mapUrl : '' }))
          : [];
        saveVisited();
        saveNotes();
        saveCustomStops();
        if (typeof data.privateCodes === 'string') {
          try {
            localStorage.setItem(PRIVATE_CODES_STORAGE_KEY, data.privateCodes);
          } catch {
            // ignore
          }
          if (privateCodesInput) privateCodesInput.value = data.privateCodes;
        }

        document.querySelectorAll('[data-note-for]').forEach((t) => {
          t.value = '';
        });
        renderSavedCustomStops();
        syncVisitedUI();
        syncNotesUI();
        applyFilters();
        announce('Τα δεδομένα επαναφέρθηκαν από το αρχείο.');
        window.alert('Η επαναφορά ολοκληρώθηκε.');
      } catch {
        window.alert('Το αρχείο δεν είναι έγκυρο αντίγραφο ασφαλείας αυτής της σελίδας.');
      }
    });
  }

  // Offline support once the page is served over http(s), e.g. GitHub Pages
  if ('serviceWorker' in navigator && window.location.protocol.startsWith('http')) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    });
  }

  // Initialize
  loadState();
  renderSavedCustomStops();
  applyTodayDefaults();
  syncVisitedUI();
  syncNotesUI();
  applyFilters();
})();
