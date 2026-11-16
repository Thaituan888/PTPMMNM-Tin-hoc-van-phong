/**
 * ===================================================================
 * DIỄN ĐÀN CỘNG ĐỒNG TIN HỌC VĂN PHÒNG - DIEN-DAN.JS
 * Xử lý: Dòng thời gian cuộn vô tận, Sắp xếp (Recent/Hot), Hashtag,
 * Khung đăng bài chuẩn Facebook, Đính kèm ảnh/file .docx/.xlsx,
 * 5 Biểu cảm Tin học (👍, ❤️, 💡, 🤯, 😢), Bình luận đa cấp bằng ảnh,
 * Nhóm học tập, Bảng vàng tuần, Danh sách Online, Trang cá nhân (Wall).
 * ===================================================================
 */

(function () {
  'use strict';

  // --- STATE ---
  const state = {
    currentUser: null,
    activeSort: 'recent', // 'recent', 'hot', 'teacher', 'score'
    activeTag: '',
    activeGroup: '',
    activeAuthor: '',
    searchKeyword: '',
    page: 1,
    limit: 8,
    hasMore: true,
    isLoading: false,
    posts: [],
    replyingToComment: null, // { id, authorName }
    composerPostType: 'general',
    composerImage: null, // { file, dataUrl, name }
    composerDocFile: null, // { file, name, size, ext }
    commentImages: {}, // postId -> { file, dataUrl }
    summary: {
      group_counts: {},
      trending_tags: [],
      leaderboard: []
    },
    allPostsCache: [],
    initialLoadDone: false,
    lastAuthUserKey: ''
  };

  const PROMPTS = [
    'Bạn đang gặp khó khăn gì với bài tập hôm nay?',
    'Chia sẻ một thủ thuật tin học bạn vừa học được!',
    'Bạn vừa thi thử đạt bao nhiêu điểm hôm nay?',
    'Có mẹo Excel, Word hay phím tắt nào cần chia sẻ không?'
  ];

  const REACTION_CONFIG = {
    like: { label: 'Thích', icon: '👍', color: '#0284c7' },
    love: { label: 'Cảm ơn', icon: '❤️', color: '#ec4899' },
    idea: { label: 'Sáng kiến', icon: '💡', color: '#f59e0b' },
    wow: { label: 'Bất ngờ', icon: '🤯', color: '#8b5cf6' },
    sad: { label: 'Khóc (Mất file)', icon: '😢', color: '#0284c7' }
  };

  // --- LOCAL STORAGE (KHỞI TẠO TRỐNG HOÀN TOÀN, KHÔNG CHÈN DỮ LIỆU MẪU) ---
  const LOCAL_POSTS_KEY = 'thvp_forum_posts';
  const LOCAL_COMMENTS_KEY = 'thvp_forum_comments';
  const LOCAL_BIOS_KEY = 'thvp_forum_bios';
  const LOCAL_AVATARS_KEY = 'thvp_forum_custom_avatars';

  const PRESET_AVATARS = [
    { name: 'Giảng viên', url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&h=200&q=80' },
    { name: 'Học viên IT', url: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=200&h=200&q=80' },
    { name: 'Học viên Nữ', url: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=200&h=200&q=80' },
    { name: 'Chuyên viên Excel', url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=200&h=200&q=80' },
    { name: 'Giảng viên Nữ', url: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=200&h=200&q=80' },
    { name: 'Tốt nghiệp CNTT', url: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&w=200&h=200&q=80' },
    { name: 'Slide PPT', url: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&w=200&h=200&q=80' },
    { name: 'Kế toán VP', url: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&w=200&h=200&q=80' }
  ];

  function clearLegacySeedData() {
    // Xóa dữ liệu demo cũ (nếu có từ phiên bản trước) để diễn đàn luôn sạch trống
    localStorage.removeItem('thvp_forum_posts_local');
    localStorage.removeItem('thvp_forum_comments_local');
  }

  function getLocalPosts() {
    try {
      return JSON.parse(localStorage.getItem(LOCAL_POSTS_KEY) || '[]');
    } catch (e) {
      return [];
    }
  }

  function getLocalComments() {
    try {
      return JSON.parse(localStorage.getItem(LOCAL_COMMENTS_KEY) || '[]');
    } catch (e) {
      return [];
    }
  }

  function getLocalAvatars() {
    try {
      return JSON.parse(localStorage.getItem(LOCAL_AVATARS_KEY) || '{}');
    } catch (e) {
      return {};
    }
  }

  // --- HELPER FUNCTIONS ---
  function isTeacherAccount(role, username) {
    const r = String(role || '').trim().toLowerCase();
    const u = String(username || '').trim().toLowerCase();
    return r === 'admin' || r === 'teacher' || r === 'giangvien' || u === 'giangvien';
  }

  function canDeletePost(post, user = state.currentUser) {
    if (!user || !post) return false;
    if (isTeacherAccount(user.role, user.username)) return true;
    const curUsername = String(user.username || '').trim().toLowerCase();
    const authorUsername = String(post.author_username || '').trim().toLowerCase();
    return Boolean(curUsername && curUsername === authorUsername);
  }

  function getAvatarUrl(username, role, customAvatar) {
    if (username) {
      const savedAvatars = getLocalAvatars();
      const saved = savedAvatars[String(username).toLowerCase()];
      if (saved && saved.length > 5) return saved;
    }
    if (customAvatar && customAvatar.length > 5) return customAvatar;
    if (isTeacherAccount(role, username)) {
      return 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=120&h=120&q=80';
    }
    return 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=120&h=120&q=80';
  }

  function formatTimeAgo(dateString) {
    const diff = (Date.now() - new Date(dateString).getTime()) / 1000;
    if (diff < 60) return 'Vừa xong';
    if (diff < 3600) return `${Math.floor(diff / 60)} phút trước`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} giờ trước`;
    if (diff < 604800) return `${Math.floor(diff / 86400)} ngày trước`;
    return new Date(dateString).toLocaleDateString('vi-VN');
  }

  function formatFileSize(bytes) {
    if (!bytes || bytes === 0) return '0 KB';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function escapeJsAttr(str) {
    if (!str) return '';
    return escapeHtml(
      String(str)
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'")
        .replace(/\r/g, '')
        .replace(/\n/g, ' ')
    );
  }

  function normalizeTextKey(str) {
    return String(str || '').replace(/\s+/g, ' ').trim();
  }

  function computeForumSummary(posts, comments) {
    const groupCounts = {};
    const tagMap = {};
    const leaderMap = {};

    (posts || []).forEach(p => {
      const grp = normalizeTextKey(p.group_name);
      if (grp) {
        groupCounts[grp] = (groupCounts[grp] || 0) + 1;
      }

      const postTags = new Set();
      if (p.tags) {
        String(p.tags).split(',').forEach(t => {
          const clean = t.trim().replace(/^#/, '');
          if (clean) postTags.add(clean);
        });
      }
      if (p.content) {
        const matches = String(p.content).match(/#([a-zA-Z0-9_\u00C0-\u024F\u1E00-\u1EFF]+)/g) || [];
        matches.forEach(m => {
          const clean = m.slice(1).trim();
          if (clean) postTags.add(clean);
        });
      }
      const seenLower = new Set();
      postTags.forEach(tag => {
        const lower = tag.toLowerCase();
        if (seenLower.has(lower)) return;
        seenLower.add(lower);
        if (!tagMap[lower]) {
          tagMap[lower] = { tag, count: 0 };
        }
        tagMap[lower].count += 1;
      });

      const uname = String(p.author_username || '').trim();
      if (uname) {
        const key = uname.toLowerCase();
        if (!leaderMap[key]) {
          leaderMap[key] = {
            username: uname,
            name: p.author_name || uname,
            role: p.author_role || 'student',
            avatar: p.author_avatar || '',
            points: 0
          };
        }
        const reactionTotal = Object.values(p.reactions || {}).reduce(
          (sum, arr) => sum + (Array.isArray(arr) ? arr.length : 0),
          0
        );
        leaderMap[key].points += 10 + reactionTotal * 5;
      }
    });

    (comments || []).forEach(c => {
      const uname = String(c.author_username || '').trim();
      if (!uname) return;
      const key = uname.toLowerCase();
      if (!leaderMap[key]) {
        leaderMap[key] = {
          username: uname,
          name: c.author_name || uname,
          role: c.author_role || 'student',
          avatar: c.author_avatar || '',
          points: 0
        };
      }
      const likes = c.reactions && Array.isArray(c.reactions.like) ? c.reactions.like.length : 0;
      leaderMap[key].points += 3 + likes * 2;
    });

    const trending_tags = Object.values(tagMap)
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);

    const leaderboard = Object.values(leaderMap)
      .filter(u => u.points > 0)
      .sort((a, b) => b.points - a.points)
      .slice(0, 5);

    return {
      group_counts: groupCounts,
      trending_tags,
      leaderboard
    };
  }

  function renderOnlineUsers() {
    const badgeEl = document.getElementById('onlineCountBadge');
    const listEl = document.getElementById('onlineUsersList');
    if (!badgeEl || !listEl) return;

    const user = state.currentUser;
    if (!user) {
      badgeEl.textContent = '0 ONLINE';
      listEl.innerHTML = '<div class="forum-empty-note">Chưa có thành viên nào đang trực tuyến.</div>';
      return;
    }

    const isTeacher = isTeacherAccount(user.role, user.username);
    const roleLabel = isTeacher ? 'Giảng viên' : 'Học viên';
    const avatar = getAvatarUrl(user.username, user.role, user.avatar);
    badgeEl.textContent = '1 ONLINE';
    listEl.innerHTML = `
      <div class="online-user-item" onclick="window.THVP_FORUM.openProfileWall('${escapeJsAttr(user.username)}')">
        <div class="online-avatar-wrap">
          <img src="${avatar}" alt="${escapeHtml(user.fullname || user.username)}" />
          <span class="online-dot"></span>
        </div>
        <div class="online-user-info">
          <div class="online-user-name">${escapeHtml(user.fullname || user.username)}</div>
          <div class="online-user-role">${roleLabel}</div>
        </div>
      </div>
    `;
  }

  function renderSidebarWidgets() {
    const summary = state.summary || { group_counts: {}, trending_tags: [], leaderboard: [] };
    const normalizedGroupCounts = {};
    Object.entries(summary.group_counts || {}).forEach(([k, v]) => {
      normalizedGroupCounts[normalizeTextKey(k)] = Number(v) || 0;
    });

    // 1. Nhóm học tập (đếm số bài thực tế)
    document.querySelectorAll('[data-group-count]').forEach(el => {
      const grpKey = normalizeTextKey(el.getAttribute('data-group-count'));
      el.textContent = normalizedGroupCounts[grpKey] || 0;
    });

    // 2. Chủ đề thịnh hành
    const trendingEl = document.getElementById('trendingTagsList');
    if (trendingEl) {
      const tags = summary.trending_tags || [];
      if (tags.length === 0) {
        trendingEl.innerHTML = '<div class="forum-empty-note">Chưa có chủ đề thịnh hành nào.</div>';
      } else {
        const activeCleanTag = state.activeTag ? state.activeTag.replace('#', '').trim().toLowerCase() : '';
        trendingEl.innerHTML = tags.map(t => {
          const isActive = activeCleanTag && t.tag.toLowerCase() === activeCleanTag ? ' active' : '';
          return `
            <div class="trending-item${isActive}" data-tag="${escapeHtml(t.tag)}" onclick="window.THVP_FORUM.filterByTag('${escapeJsAttr(t.tag)}')">
              <span class="trending-tag">#${escapeHtml(t.tag)}</span>
              <span class="trending-count">${Number(t.count) || 0} thảo luận</span>
            </div>
          `;
        }).join('');
      }
    }

    // 3. Thành viên trực tuyến
    renderOnlineUsers();

    // 4. Bảng vàng tuần
    const lbEl = document.getElementById('forumLeaderboardList');
    if (lbEl) {
      const leaders = summary.leaderboard || [];
      if (leaders.length === 0) {
        lbEl.innerHTML = '<div class="forum-empty-note">Chưa có dữ liệu bảng vàng.</div>';
      } else {
        lbEl.innerHTML = leaders.map((item, idx) => {
          const rankClass = idx === 0 ? 'rank-1' : (idx === 1 ? 'rank-2' : (idx === 2 ? 'rank-3' : ''));
          const avatar = getAvatarUrl(item.username, item.role, item.avatar);
          return `
            <div class="leader-item" onclick="window.THVP_FORUM.openProfileWall('${escapeJsAttr(item.username)}')">
              <div class="leader-rank ${rankClass}">${idx + 1}</div>
              <img src="${avatar}" class="leader-avatar" alt="${escapeHtml(item.name || item.username)}" />
              <div class="leader-info">
                <div class="leader-name">${escapeHtml(item.name || item.username)}</div>
                <div class="leader-points">${Number(item.points) || 0} điểm đóng góp</div>
              </div>
            </div>
          `;
        }).join('');
      }
    }
  }

  function renderFormattedContent(text) {
    let safe = escapeHtml(text);
    // Replace hashtags: #HoiDapExcel -> <a class="tag-link" data-tag="HoiDapExcel">#HoiDapExcel</a>
    safe = safe.replace(/#([a-zA-Z0-9_\u00C0-\u024F\u1E00-\u1EFF]+)/g, '<a href="javascript:void(0)" class="tag-link" data-tag="$1">#$1</a>');
    // Replace mentions: @Giangvien -> <span class="mention-tag">@Giangvien</span>
    safe = safe.replace(/@([a-zA-Z0-9_\u00C0-\u024F\u1E00-\u1EFF]+)/g, '<span class="mention-tag">@$1</span>');
    return safe;
  }

  function showToast(msg, type = 'info') {
    if (window.THVP_AUTH && typeof window.THVP_AUTH.showToast === 'function') {
      window.THVP_AUTH.showToast(msg, type);
    } else {
      alert(msg);
    }
  }

  function triggerLoginPrompt(reason) {
    const dialog = document.getElementById('loginPromptDialog');
    const msgEl = document.getElementById('loginPromptMsg');
    if (dialog && msgEl) {
      msgEl.textContent = reason || 'Vui lòng đăng nhập để thực hiện chức năng này.';
      dialog.classList.add('open');
    } else if (window.THVP_AUTH && typeof window.THVP_AUTH.showModal === 'function') {
      window.THVP_AUTH.showModal('login');
    }
  }

  // --- DATA ACCESS LAYER (HYBRID: API PHP MYSQL + LOCALSTORAGE FALLBACK) ---
  async function loadPostsData() {
    state.isLoading = true;
    renderFeedLoading();

    // 1. Thử gọi API PHP
    try {
      const params = new URLSearchParams({
        sort: state.activeSort,
        tag: state.activeTag,
        group: state.activeGroup,
        type: state.activeSort === 'teacher' ? '' : (state.activeSort === 'score' ? 'score_brag' : ''),
        author: state.activeSort === 'teacher' ? 'Giangvien' : state.activeAuthor,
        search: state.searchKeyword,
        page: state.page,
        limit: state.limit
      });

      const res = await fetch(`api.php?action=forum_get_posts&${params.toString()}`);
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          const fetchedPosts = Array.isArray(json.data.posts) ? json.data.posts : [];
          if (state.page <= 1) {
            state.posts = fetchedPosts;
          } else {
            const existingIds = new Set(state.posts.map(p => String(p.id)));
            state.posts = state.posts.concat(fetchedPosts.filter(p => !existingIds.has(String(p.id))));
          }
          state.hasMore = Boolean(json.data.has_more);
          state.summary = json.data.summary || computeForumSummary(state.posts, []);
          renderFeed();
          renderSidebarWidgets();
          updateCurrentUserDisplay();
          state.isLoading = false;
          return;
        }
      }
    } catch (e) {
      // API offline -> chuyển sang localStorage fallback
    }

    // 2. Fallback sang LocalStorage (trống mặc định khi chưa có bài viết)
    const allLocalPosts = getLocalPosts();
    const allLocalComments = getLocalComments();
    const commentCounts = {};
    allLocalComments.forEach(c => {
      const pid = String(c.post_id);
      commentCounts[pid] = (commentCounts[pid] || 0) + 1;
    });

    const enrichedPosts = allLocalPosts.map(p => ({
      ...p,
      comment_count: commentCounts[String(p.id)] ?? (Number(p.comment_count) || 0)
    }));

    state.allPostsCache = enrichedPosts;
    state.summary = computeForumSummary(enrichedPosts, allLocalComments);

    let filteredPosts = enrichedPosts.slice();

    // Lọc theo tag
    if (state.activeTag) {
      const clean = state.activeTag.toLowerCase().replace('#', '').trim();
      filteredPosts = filteredPosts.filter(
        p => (p.tags && String(p.tags).toLowerCase().includes(clean))
          || (p.content && String(p.content).toLowerCase().includes('#' + clean))
      );
    }

    // Lọc theo group
    if (state.activeGroup) {
      const targetGroup = normalizeTextKey(state.activeGroup).toLowerCase();
      filteredPosts = filteredPosts.filter(p => normalizeTextKey(p.group_name).toLowerCase() === targetGroup);
    }

    // Lọc theo Author
    if (state.activeAuthor) {
      filteredPosts = filteredPosts.filter(
        p => String(p.author_username || '').toLowerCase() === state.activeAuthor.toLowerCase()
      );
    }

    // Tìm kiếm từ khóa
    if (state.searchKeyword) {
      const kw = state.searchKeyword.toLowerCase().trim();
      filteredPosts = filteredPosts.filter(
        p => (p.title && p.title.toLowerCase().includes(kw))
          || (p.content && p.content.toLowerCase().includes(kw))
          || (p.author_name && p.author_name.toLowerCase().includes(kw))
      );
    }

    // Sắp xếp
    if (state.activeSort === 'teacher') {
      filteredPosts = filteredPosts.filter(
        p => isTeacherAccount(p.author_role, p.author_username)
      );
    } else if (state.activeSort === 'score') {
      filteredPosts = filteredPosts.filter(p => p.post_type === 'score_brag' || p.meta_score);
    }

    if (state.activeSort === 'hot') {
      filteredPosts.sort((a, b) => {
        const countReactions = p => Object.values(p.reactions || {}).reduce(
          (acc, arr) => acc + (Array.isArray(arr) ? arr.length : 0),
          0
        );
        return (countReactions(b) + (b.comment_count || 0)) - (countReactions(a) + (a.comment_count || 0));
      });
    } else {
      // Recent (Mặc định: Pinned lên đầu, sau đó theo ID giảm dần)
      filteredPosts.sort((a, b) => (b.is_pinned || 0) - (a.is_pinned || 0) || b.id - a.id);
    }

    const total = filteredPosts.length;
    const endIdx = Math.max(1, state.page) * state.limit;
    state.posts = filteredPosts.slice(0, endIdx);
    state.hasMore = endIdx < total;

    renderFeed();
    renderSidebarWidgets();
    updateCurrentUserDisplay();
    state.isLoading = false;
  }

  async function getCommentsForPost(postId) {
    try {
      const res = await fetch(`api.php?action=forum_get_comments&post_id=${postId}`);
      if (res.ok) {
        const json = await res.json();
        if (json.success) return json.data;
      }
    } catch (e) {}

    // Fallback LocalStorage
    const allComments = getLocalComments();
    return allComments.filter(c => Number(c.post_id) === Number(postId));
  }

  // --- RENDER FUNCTIONS ---
  function updateCurrentUserDisplay() {
    state.currentUser = window.THVP_AUTH ? window.THVP_AUTH.getCurrentUser() : null;
    const user = state.currentUser;

    // 1. Cột trái Mini Profile
    const leftProfileEl = document.getElementById('forumMiniProfile');
    if (leftProfileEl) {
      if (!user) {
        leftProfileEl.innerHTML = `
          <div class="mini-profile-cover"></div>
          <div class="mini-profile-body">
            <div class="mini-profile-avatar-wrap">
              <img src="https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=120&h=120&q=80" class="mini-profile-avatar" alt="Khách" />
            </div>
            <div class="mini-profile-name">Khách vãng lai</div>
            <div class="mini-profile-sub">Chưa đăng nhập tài khoản</div>
            <p style="font-size: 12px; color: var(--text-muted); margin-bottom: 12px;">Đăng nhập để đăng bài hỏi bài tập, thả cảm xúc và thảo luận cùng lớp.</p>
            <button type="button" class="btn-view-wall" onclick="window.THVP_AUTH && window.THVP_AUTH.showModal('login')">
              👉 ĐĂNG NHẬP NGAY
            </button>
          </div>
        `;
      } else {
        const isTeacher = isTeacherAccount(user.role, user.username);
        const roleName = isTeacher ? 'Giảng viên' : 'Học viên';
        const roleClass = isTeacher ? 'teacher' : 'student';
        const avatar = getAvatarUrl(user.username, user.role, user.avatar);

        const knownPostsMap = new Map();
        (state.allPostsCache || []).forEach(p => knownPostsMap.set(String(p.id), p));
        (state.posts || []).forEach(p => knownPostsMap.set(String(p.id), p));
        const unameLower = String(user.username || '').toLowerCase();
        const myPosts = Array.from(knownPostsMap.values()).filter(
          p => String(p.author_username || '').toLowerCase() === unameLower
        );
        const myThanksCount = myPosts.reduce((sum, p) => {
          return sum + Object.values(p.reactions || {}).reduce(
            (s, arr) => s + (Array.isArray(arr) ? arr.length : 0),
            0
          );
        }, 0);

        leftProfileEl.innerHTML = `
          <div class="mini-profile-cover"></div>
          <div class="mini-profile-body">
            <div class="mini-profile-avatar-wrap" onclick="window.THVP_FORUM.openProfileWall('${escapeJsAttr(user.username)}')">
              <img src="${avatar}" class="mini-profile-avatar" alt="${escapeHtml(user.fullname || user.username)}" />
            </div>
            <div class="mini-profile-name" onclick="window.THVP_FORUM.openProfileWall('${escapeJsAttr(user.username)}')">
              ${escapeHtml(user.fullname || user.username)}
              <span class="role-badge ${roleClass}">${roleName}</span>
            </div>
            <div class="mini-profile-sub">${user.mssv ? 'Mã: ' + escapeHtml(user.mssv) : '@' + escapeHtml(user.username)}</div>
            <div class="mini-profile-stats">
              <div>
                <div class="stat-item-num">${myPosts.length}</div>
                <div class="stat-item-label">Bài viết</div>
              </div>
              <div>
                <div class="stat-item-num">${myThanksCount}</div>
                <div class="stat-item-label">Cảm ơn</div>
              </div>
            </div>
            <button type="button" class="btn-view-wall" onclick="window.THVP_FORUM.openProfileWall('${escapeJsAttr(user.username)}')">
              👤 Xem Trang Cá Nhân
            </button>
          </div>
        `;
      }
    }

    // 2. Khung Đăng Bài (Create Post Bar)
    const createAvatarEl = document.getElementById('createPostAvatar');
    const createInputEl = document.getElementById('createPostInput');
    if (createAvatarEl) {
      createAvatarEl.src = user ? getAvatarUrl(user.username, user.role, user.avatar) : 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=120&h=120&q=80';
    }
    if (createInputEl) {
      if (user) {
        const randomPrompt = PROMPTS[Math.floor(Math.random() * PROMPTS.length)];
        createInputEl.textContent = `${user.fullname || user.username} ơi, ${randomPrompt}`;
      } else {
        createInputEl.textContent = 'Đăng nhập để đặt câu hỏi, chia sẻ mẹo tin học và thi thử...';
      }
    }
  }

  function renderFeedLoading() {
    const feedList = document.getElementById('forumFeedList');
    if (feedList) {
      feedList.innerHTML = `
        <div class="feed-loader-container">
          <div class="feed-spinner"></div>
        </div>
      `;
    }
  }

  function renderFeed() {
    const feedList = document.getElementById('forumFeedList');
    if (!feedList) return;

    if (!state.posts || state.posts.length === 0) {
      feedList.innerHTML = `
        <div class="post-card" style="text-align: center; padding: 40px 20px;">
          <div style="font-size: 40px; margin-bottom: 12px;">📂</div>
          <h3 style="font-size: 16px; font-weight: 700; margin-bottom: 6px;">Chưa có bài viết nào trong mục này!</h3>
          <p style="font-size: 13.5px; color: var(--text-muted); margin-bottom: 16px;">Hãy là người đầu tiên đặt câu hỏi hoặc chia sẻ thủ thuật tin học bổ ích.</p>
          <button type="button" class="btn-submit-post" onclick="window.THVP_FORUM.openComposer()">+ ĐĂNG BÀI NGAY</button>
        </div>
      `;
      return;
    }

    let html = '';
    state.posts.forEach(post => {
      html += createPostCardHtml(post);
    });

    if (state.hasMore) {
      html += `<button type="button" class="btn-load-more" onclick="window.THVP_FORUM.loadMorePosts()">Xem thêm bài viết cũ hơn...</button>`;
    } else {
      html += `<div class="feed-end-notice">✨ Bạn đã xem hết tất cả các bài viết mới nhất trên Dòng thời gian!</div>`;
    }

    feedList.innerHTML = html;
  }

  function createPostCardHtml(post) {
    const isTeacher = isTeacherAccount(post.author_role, post.author_username);
    const roleBadgeHtml = isTeacher
      ? `<span class="role-badge teacher">Giảng viên</span>`
      : `<span class="role-badge student">Học viên</span>`;
    const avatarUrl = getAvatarUrl(post.author_username, post.author_role, post.author_avatar);

    // Xử lý cảm xúc
    const feelingHtml = post.feeling ? `<span class="post-feeling-text">${escapeHtml(post.feeling)}</span>` : '';

    // Xử lý tiêu đề
    const titleHtml = post.title ? `<h3 class="post-title">${escapeHtml(post.title)}</h3>` : '';

    // Xử lý nội dung (chuyển tag link & mention)
    const contentHtml = renderFormattedContent(post.content);

    // Xử lý thẻ khoe điểm thi thử
    let scoreCardHtml = '';
    if (post.meta_score) {
      const ms = typeof post.meta_score === 'string' ? JSON.parse(post.meta_score) : post.meta_score;
      scoreCardHtml = `
        <div class="score-brag-card">
          <div class="score-left-info">
            <div class="score-subject">${escapeHtml(ms.subject || 'Tin Học Văn Phòng')}</div>
            <div class="score-exam-name">${escapeHtml(ms.exam || 'Bài Thi Thử Chuẩn Kỹ Năng')}</div>
            <div class="score-stars">⭐⭐⭐⭐⭐ Hoàn thành xuất sắc</div>
          </div>
          <div class="score-circle-badge">
            <span class="score-val">${escapeHtml(ms.score || '10.0')}</span>
            <span class="score-max">/10 ĐIỂM</span>
          </div>
        </div>
      `;
    }

    // Xử lý ảnh đính kèm
    let imageAttachmentHtml = '';
    if (post.image_data || post.image_name) {
      const src = post.image_data
        ? post.image_data
        : (post.image_path ? post.image_path : `api.php?action=preview_forum_image&id=${post.id}&type=image`);
      imageAttachmentHtml = `
        <div class="post-media-container">
          <img src="${src}" class="post-image-preview" alt="Ảnh đính kèm" onclick="window.THVP_FORUM.openLightbox(this.src)" />
        </div>
      `;
    }

    // Xử lý file đính kèm (.docx, .xlsx, .pptx, .pdf)
    let fileAttachmentHtml = '';
    if (post.file_name) {
      const ext = post.file_name.split('.').pop().toLowerCase();
      let badgeClass = 'archive';
      let badgeTxt = ext.toUpperCase();
      if (['xlsx', 'xls', 'csv'].includes(ext)) { badgeClass = 'excel'; badgeTxt = 'XLSX'; }
      else if (['docx', 'doc'].includes(ext)) { badgeClass = 'word'; badgeTxt = 'DOCX'; }
      else if (['pptx', 'ppt'].includes(ext)) { badgeClass = 'powerpoint'; badgeTxt = 'PPTX'; }
      else if (['pdf'].includes(ext)) { badgeClass = 'pdf'; badgeTxt = 'PDF'; }

      fileAttachmentHtml = `
        <div class="post-file-box">
          <div class="file-info-left">
            <div class="file-icon-badge ${badgeClass}">${badgeTxt}</div>
            <div class="file-details">
              <span class="file-name-txt">${escapeHtml(post.file_name)}</span>
              <span class="file-size-txt">${formatFileSize(post.file_size)} • Đính kèm bài thực hành</span>
            </div>
          </div>
          <a href="api.php?action=download_forum_file&id=${post.id}" class="btn-download-file" download="${escapeHtml(post.file_name)}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
            Tải File Về Sửa Giúp
          </a>
        </div>
      `;
    }

    // Xử lý thống kê cảm xúc
    const reactions = post.reactions || { like: [], love: [], idea: [], wow: [], sad: [] };
    const myUsername = state.currentUser ? state.currentUser.username : null;
    let myReaction = null;
    let totalReactions = 0;
    const iconsPresent = [];

    Object.keys(REACTION_CONFIG).forEach(type => {
      const list = reactions[type] || [];
      if (list.length > 0) {
        iconsPresent.push(REACTION_CONFIG[type].icon);
        totalReactions += list.length;
      }
      if (myUsername && list.includes(myUsername)) {
        myReaction = type;
      }
    });

    const reactionIconsHtml = iconsPresent.length > 0
      ? `<div class="reaction-icons-group">${iconsPresent.map(ic => `<span>${ic}</span>`).join('')} <span class="reaction-count-txt">${totalReactions}</span></div>`
      : `<span style="color: var(--text-sub);">Hãy là người đầu tiên thả biểu cảm!</span>`;

    // Nút biểu cảm chính
    const currentReactionConfig = myReaction ? REACTION_CONFIG[myReaction] : { label: 'Thích', icon: '👍', color: '' };
    const reactionBtnClass = myReaction ? `btn-toolbar-action reaction-btn active-reaction active-${myReaction}` : `btn-toolbar-action reaction-btn`;

    // Dropdown menu (Xóa bài nếu là tác giả hoặc tài khoản giáo viên)
    const canDelete = canDeletePost(post);
    const isAuthor = state.currentUser && String(state.currentUser.username || '').trim().toLowerCase() === String(post.author_username || '').trim().toLowerCase();
    const isTeacherDelete = canDelete && !isAuthor && isTeacherAccount(state.currentUser.role, state.currentUser.username);
    const menuBtnHtml = canDelete
      ? `<button type="button" class="post-menu-btn${isTeacherDelete ? ' post-delete-teacher' : ''}" onclick="window.THVP_FORUM.deletePost(${post.id})" title="${isTeacherDelete ? 'Xóa bài viết của học viên (Quyền Giáo viên)' : 'Xóa bài viết'}">${isTeacherDelete ? '🗑️ Xóa bài' : '🗑️'}</button>`
      : '';

    // Thẻ Pinned
    const pinnedHtml = post.is_pinned ? `<div class="pinned-badge-strip">📌 BÀI GHIM TỪ GIẢNG VIÊN</div>` : '';

    return `
      <article class="post-card ${post.is_pinned ? 'pinned' : ''}" id="post-${post.id}" data-id="${post.id}">
        ${pinnedHtml}
        
        <!-- Post Header -->
        <div class="post-header">
          <div class="post-author-info">
            <div class="post-avatar-wrap" onclick="window.THVP_FORUM.openProfileWall('${escapeJsAttr(post.author_username)}')">
              <img src="${avatarUrl}" alt="${escapeHtml(post.author_name)}" />
            </div>
            <div class="post-author-text">
              <div class="post-author-name-row">
                <span class="post-author-name" onclick="window.THVP_FORUM.openProfileWall('${escapeJsAttr(post.author_username)}')">${escapeHtml(post.author_name)}</span>
                ${roleBadgeHtml}
                ${feelingHtml}
              </div>
              <div class="post-meta-sub">
                <span>${formatTimeAgo(post.created_at)}</span>
                ${post.group_name ? `<span class="dot">•</span><span class="post-group-tag" onclick="window.THVP_FORUM.filterByGroup('${escapeJsAttr(post.group_name)}')">${escapeHtml(post.group_name)}</span>` : ''}
              </div>
            </div>
          </div>
          ${menuBtnHtml}
        </div>

        <!-- Post Content -->
        ${titleHtml}
        <div class="post-body-text">${contentHtml}</div>
        ${scoreCardHtml}
        ${imageAttachmentHtml}
        ${fileAttachmentHtml}

        <!-- Post Stats Row -->
        <div class="post-stats-row">
          ${reactionIconsHtml}
          <div class="comment-count-txt" onclick="window.THVP_FORUM.toggleComments(${post.id})">
            💬 <span id="cmt-count-${post.id}">${post.comment_count || 0}</span> bình luận
          </div>
        </div>

        <!-- Post Actions Toolbar -->
        <div class="post-actions-toolbar">
          <button type="button" class="${reactionBtnClass}" onclick="window.THVP_FORUM.handleQuickReaction(${post.id}, '${myReaction || 'like'}')">
            <!-- 5 Reactions Popover -->
            <div class="reaction-picker-popover" onclick="event.stopPropagation()">
              <div class="reaction-bubble-btn" onclick="window.THVP_FORUM.submitReaction(${post.id}, 'like')">
                👍<span class="reaction-tooltip">Thích</span>
              </div>
              <div class="reaction-bubble-btn" onclick="window.THVP_FORUM.submitReaction(${post.id}, 'love')">
                ❤️<span class="reaction-tooltip">Cảm ơn</span>
              </div>
              <div class="reaction-bubble-btn" onclick="window.THVP_FORUM.submitReaction(${post.id}, 'idea')">
                💡<span class="reaction-tooltip">Sáng kiến</span>
              </div>
              <div class="reaction-bubble-btn" onclick="window.THVP_FORUM.submitReaction(${post.id}, 'wow')">
                🤯<span class="reaction-tooltip">Bất ngờ</span>
              </div>
              <div class="reaction-bubble-btn" onclick="window.THVP_FORUM.submitReaction(${post.id}, 'sad')">
                😢<span class="reaction-tooltip">Khóc (Mất file)</span>
              </div>
            </div>
            <span>${currentReactionConfig.icon}</span>
            <span class="action-label">${currentReactionConfig.label}</span>
          </button>

          <button type="button" class="btn-toolbar-action" onclick="window.THVP_FORUM.toggleComments(${post.id})">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            <span class="action-label">Bình luận</span>
          </button>

          <button type="button" class="btn-toolbar-action" onclick="window.THVP_FORUM.sharePost(${post.id})">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
            <span class="action-label">Chia sẻ</span>
          </button>
        </div>

        <!-- Comments Container (Ẩn mặc định, bấm bình luận sẽ mở) -->
        <div class="post-comments-section" id="comments-section-${post.id}" style="display: none;">
          <div class="comments-list" id="comments-list-${post.id}">
            <div style="text-align: center; color: var(--text-muted); padding: 8px;">Đang tải bình luận...</div>
          </div>
          ${renderCommentInputBoxHtml(post.id)}
        </div>
      </article>
    `;
  }

  function renderCommentInputBoxHtml(postId) {
    if (!state.currentUser) {
      return `
        <div class="comment-guest-lock">
          🔒 Vui lòng <a onclick="window.THVP_AUTH && window.THVP_AUTH.showModal('login')">đăng nhập</a> để bình luận và gửi ảnh giải đáp bài tập.
        </div>
      `;
    }

    const myAvatar = getAvatarUrl(state.currentUser.username, state.currentUser.role, state.currentUser.avatar);

    return `
      <div class="comment-input-box" id="cmt-input-box-${postId}">
        <div class="comment-avatar-wrap">
          <img src="${myAvatar}" alt="${escapeHtml(state.currentUser.fullname)}" />
        </div>
        <div class="comment-form-inner">
          <div id="replying-pill-${postId}" style="display: none;"></div>
          <textarea class="comment-textarea" id="cmt-text-${postId}" placeholder="Viết bình luận hoặc bấm Ctrl+V để dán ảnh..." onkeydown="window.THVP_FORUM.handleCommentKeyDown(event, ${postId})"></textarea>
          
          <div class="comment-attach-preview" id="cmt-preview-${postId}" style="display: none;"></div>

          <div class="comment-tools-row">
            <div class="comment-left-tools">
              <label class="btn-cmt-tool" title="Đính kèm ảnh chụp màn hình công thức">
                📷
                <input type="file" accept="image/*" style="display: none;" onchange="window.THVP_FORUM.handleCommentImageSelect(event, ${postId})" />
              </label>
              <button type="button" class="btn-cmt-tool" title="Chèn nhanh @Giangvien" onclick="window.THVP_FORUM.insertMentionInComment(${postId}, '@Giangvien')">
                @GV
              </button>
            </div>
            <button type="button" class="btn-send-comment" onclick="window.THVP_FORUM.submitComment(${postId})" title="Gửi bình luận">
              ➤
            </button>
          </div>
        </div>
      </div>
    `;
  }

  // --- COMMENTS PROCESSING (NESTED THREADS) ---
  async function toggleComments(postId) {
    const section = document.getElementById(`comments-section-${postId}`);
    if (!section) return;

    if (section.style.display === 'none') {
      section.style.display = 'block';
      await loadAndRenderComments(postId);
    } else {
      section.style.display = 'none';
    }
  }

  async function loadAndRenderComments(postId) {
    const listEl = document.getElementById(`comments-list-${postId}`);
    if (!listEl) return;

    const comments = await getCommentsForPost(postId);
    const countEl = document.getElementById(`cmt-count-${postId}`);
    if (countEl) countEl.textContent = comments.length;

    if (comments.length === 0) {
      listEl.innerHTML = `<div style="text-align: center; color: var(--text-sub); font-size: 13px; padding: 10px;">Chưa có bình luận nào. Hãy bắt đầu cuộc trò chuyện!</div>`;
      return;
    }

    // Phân loại: Root comments (parent_id == 0) và Replies (parent_id > 0)
    const rootComments = comments.filter(c => !c.parent_id || c.parent_id == 0);
    const repliesMap = {};
    comments.forEach(c => {
      if (c.parent_id && c.parent_id != 0) {
        if (!repliesMap[c.parent_id]) repliesMap[c.parent_id] = [];
        repliesMap[c.parent_id].push(c);
      }
    });

    let html = '';
    rootComments.forEach(c => {
      html += renderSingleCommentHtml(c, postId);
      // Render nested replies
      if (repliesMap[c.id] && repliesMap[c.id].length > 0) {
        html += `<div class="nested-replies-list">`;
        repliesMap[c.id].forEach(rep => {
          html += renderSingleCommentHtml(rep, postId, true);
        });
        html += `</div>`;
      }
    });

    listEl.innerHTML = html;
  }

  function renderSingleCommentHtml(c, postId, isNested = false) {
    const isTeacher = isTeacherAccount(c.author_role, c.author_username);
    const badgeHtml = isTeacher ? `<span class="role-badge teacher" style="font-size: 9px; padding: 1px 5px;">GV</span>` : '';
    const avatar = getAvatarUrl(c.author_username, c.author_role, c.author_avatar);

    let imageHtml = '';
    if (c.image_data || c.image_path || c.image_name) {
      const src = c.image_data || (c.image_path ? c.image_path : `api.php?action=preview_forum_image&id=${c.id}&type=comment`);
      if (src) {
        imageHtml = `<img src="${src}" class="comment-image-attachment" alt="Ảnh trả lời" onclick="window.THVP_FORUM.openLightbox(this.src)" />`;
      }
    }

    const myUsername = state.currentUser ? state.currentUser.username : null;
    const likesList = (c.reactions && c.reactions.like) || [];
    const isLiked = myUsername && likesList.includes(myUsername);

    return `
      <div class="comment-item ${isNested ? 'nested-comment-item' : ''}" id="comment-${c.id}">
        <div class="comment-avatar-wrap" onclick="window.THVP_FORUM.openProfileWall('${escapeJsAttr(c.author_username)}')">
          <img src="${avatar}" alt="${escapeHtml(c.author_name)}" />
        </div>
        <div class="comment-content-wrap">
          <div class="comment-bubble">
            <span class="comment-author-name" onclick="window.THVP_FORUM.openProfileWall('${escapeJsAttr(c.author_username)}')">
              ${escapeHtml(c.author_name)} ${badgeHtml}
            </span>
            <div class="comment-text">${renderFormattedContent(c.content)}</div>
            ${imageHtml}
          </div>
          <div class="comment-actions-bar">
            <span>${formatTimeAgo(c.created_at)}</span>
            <span class="btn-comment-action ${isLiked ? 'active-liked' : ''}" onclick="window.THVP_FORUM.reactComment(${postId}, ${c.id})">
              ${isLiked ? '❤️ Đã thích' : 'Thích'} ${likesList.length > 0 ? `(${likesList.length})` : ''}
            </span>
            <span class="btn-comment-action" onclick="window.THVP_FORUM.prepareReply(${postId}, ${isNested ? c.parent_id : c.id}, '${escapeJsAttr(c.author_name)}')">
              Phản hồi
            </span>
          </div>
        </div>
      </div>
    `;
  }

  // --- ACTIONS (REACTIONS, POSTING, COMMENTING) ---
  function handleQuickReaction(postId, currentType) {
    if (!state.currentUser) {
      triggerLoginPrompt('Vui lòng đăng nhập để bày tỏ cảm xúc với bài viết này.');
      return;
    }
    submitReaction(postId, currentType || 'like');
  }

  async function submitReaction(postId, reactionType) {
    if (!state.currentUser) {
      triggerLoginPrompt('Vui lòng đăng nhập để thả cảm xúc.');
      return;
    }

    const post = state.posts.find(p => p.id === postId);
    if (!post) return;

    const username = state.currentUser.username;
    if (!post.reactions) post.reactions = { like: [], love: [], idea: [], wow: [], sad: [] };

    // 1. Thử gọi API PHP
    try {
      const formData = new FormData();
      formData.append('post_id', postId);
      formData.append('reaction', reactionType);
      formData.append('username', username);

      const res = await fetch('api.php?action=forum_react_post', { method: 'POST', body: formData });
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          post.reactions = json.data.reactions;
          renderFeed();
          return;
        }
      }
    } catch (e) {}

    // 2. Fallback LocalStorage
    const types = ['like', 'love', 'idea', 'wow', 'sad'];
    if (!post.reactions) post.reactions = {};
    let prevType = null;
    types.forEach(t => {
      if (!Array.isArray(post.reactions[t])) post.reactions[t] = [];
      const idx = post.reactions[t].indexOf(username);
      if (idx !== -1) {
        prevType = t;
        post.reactions[t].splice(idx, 1);
      }
    });

    if (prevType !== reactionType) {
      post.reactions[reactionType].push(username);
    }

    // Lưu vào LocalStorage
    const localPosts = getLocalPosts();
    const target = localPosts.find(p => Number(p.id) === Number(postId));
    if (target) {
      target.reactions = post.reactions;
      localStorage.setItem(LOCAL_POSTS_KEY, JSON.stringify(localPosts));
    }

    state.allPostsCache = localPosts;
    state.summary = computeForumSummary(localPosts, getLocalComments());
    renderFeed();
    renderSidebarWidgets();
    updateCurrentUserDisplay();
  }

  async function reactComment(postId, commentId) {
    if (!state.currentUser) {
      triggerLoginPrompt('Vui lòng đăng nhập để thích bình luận.');
      return;
    }

    const username = state.currentUser.username;

    // 1. Thử gọi API
    try {
      const fd = new FormData();
      fd.append('comment_id', commentId);
      fd.append('username', username);
      const res = await fetch('api.php?action=forum_react_comment', { method: 'POST', body: fd });
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          await loadAndRenderComments(postId);
          return;
        }
      }
    } catch (e) {}

    // 2. Fallback LocalStorage
    const allComments = JSON.parse(localStorage.getItem(LOCAL_COMMENTS_KEY) || '[]');
    const c = allComments.find(x => x.id === commentId);
    if (c) {
      if (!c.reactions) c.reactions = { like: [] };
      const idx = c.reactions.like.indexOf(username);
      if (idx !== -1) c.reactions.like.splice(idx, 1);
      else c.reactions.like.push(username);
      localStorage.setItem(LOCAL_COMMENTS_KEY, JSON.stringify(allComments));
      await loadAndRenderComments(postId);
    }
  }

  function prepareReply(postId, parentId, authorName) {
    state.replyingToComment = { postId, parentId, authorName };
    const pill = document.getElementById(`replying-pill-${postId}`);
    const textarea = document.getElementById(`cmt-text-${postId}`);

    if (pill) {
      pill.style.display = 'flex';
      pill.innerHTML = `
        <span>Đang phản hồi <strong>${escapeHtml(authorName)}</strong></span>
        <button type="button" onclick="window.THVP_FORUM.cancelReply(${postId})">✕</button>
      `;
    }
    if (textarea) {
      textarea.value = `@${authorName} `;
      textarea.focus();
    }
  }

  function cancelReply(postId) {
    state.replyingToComment = null;
    const pill = document.getElementById(`replying-pill-${postId}`);
    if (pill) pill.style.display = 'none';
  }

  function handleCommentKeyDown(e, postId) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submitComment(postId);
    }
  }

  function handleCommentImageSelect(e, postId) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (evt) {
      state.commentImages[postId] = { file, dataUrl: evt.target.result };
      const previewEl = document.getElementById(`cmt-preview-${postId}`);
      if (previewEl) {
        previewEl.style.display = 'inline-block';
        previewEl.innerHTML = `
          <img src="${evt.target.result}" alt="Preview" />
          <div class="btn-remove-cmt-img" onclick="window.THVP_FORUM.removeCommentImage(${postId})">✕</div>
        `;
      }
    };
    reader.readAsDataURL(file);
  }

  function removeCommentImage(postId) {
    delete state.commentImages[postId];
    const previewEl = document.getElementById(`cmt-preview-${postId}`);
    if (previewEl) {
      previewEl.style.display = 'none';
      previewEl.innerHTML = '';
    }
  }

  function insertMentionInComment(postId, tag) {
    const textarea = document.getElementById(`cmt-text-${postId}`);
    if (textarea) {
      textarea.value += ' ' + tag + ' ';
      textarea.focus();
    }
  }

  async function submitComment(postId) {
    if (!state.currentUser) {
      triggerLoginPrompt('Vui lòng đăng nhập để bình luận.');
      return;
    }

    const textarea = document.getElementById(`cmt-text-${postId}`);
    const content = textarea ? textarea.value.trim() : '';
    const imgData = state.commentImages[postId];

    if (!content && !imgData) {
      showToast('Vui lòng nhập nội dung bình luận!', 'warning');
      return;
    }

    const parentId = (state.replyingToComment && state.replyingToComment.postId === postId) ? state.replyingToComment.parentId : 0;

    // 1. Gọi API PHP
    try {
      const fd = new FormData();
      fd.append('post_id', postId);
      fd.append('parent_id', parentId);
      fd.append('content', content);
      fd.append('author_name', state.currentUser.fullname || state.currentUser.username);
      fd.append('author_username', state.currentUser.username);
      fd.append('author_role', state.currentUser.role || 'student');
      fd.append('author_avatar', state.currentUser.avatar || '');
      fd.append('user_id', state.currentUser.id || 0);

      if (imgData) {
        if (imgData.file) fd.append('image', imgData.file);
        else if (imgData.dataUrl) fd.append('image_base64', imgData.dataUrl);
      }

      const res = await fetch('api.php?action=forum_add_comment', { method: 'POST', body: fd });
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          showToast('Đã gửi bình luận!', 'success');
          if (textarea) textarea.value = '';
          removeCommentImage(postId);
          cancelReply(postId);
          await loadAndRenderComments(postId);
          return;
        }
      }
    } catch (e) {}

    // 2. Fallback LocalStorage
    const allComments = getLocalComments();
    const newComment = {
      id: Date.now(),
      post_id: postId,
      parent_id: parentId,
      user_id: state.currentUser.id || 0,
      author_name: state.currentUser.fullname || state.currentUser.username,
      author_username: state.currentUser.username,
      author_role: state.currentUser.role || 'student',
      author_avatar: state.currentUser.avatar || '',
      content: content,
      image_name: imgData ? 'comment_img.png' : '',
      image_data: imgData ? imgData.dataUrl : null,
      reactions: { like: [] },
      created_at: new Date().toISOString()
    };

    allComments.push(newComment);
    localStorage.setItem(LOCAL_COMMENTS_KEY, JSON.stringify(allComments));

    // Cập nhật số đếm bình luận trong post
    const localPosts = getLocalPosts();
    const p = localPosts.find(x => Number(x.id) === Number(postId));
    if (p) {
      p.comment_count = (p.comment_count || 0) + 1;
      localStorage.setItem(LOCAL_POSTS_KEY, JSON.stringify(localPosts));
    }

    state.allPostsCache = localPosts;
    state.summary = computeForumSummary(localPosts, allComments);
    renderSidebarWidgets();

    showToast('Đã gửi bình luận!', 'success');
    if (textarea) textarea.value = '';
    removeCommentImage(postId);
    cancelReply(postId);
    await loadAndRenderComments(postId);
  }

  // --- POST COMPOSER MODAL ---
  function openComposer(defaultType = 'general') {
    if (!state.currentUser) {
      triggerLoginPrompt('Vui lòng đăng nhập để tạo bài viết trên Diễn đàn.');
      return;
    }

    const modal = document.getElementById('composerModal');
    if (!modal) return;

    state.composerPostType = defaultType;
    updateComposerCategoryChips();

    // Reset fields
    const titleInput = document.getElementById('composerTitleInput');
    const textArea = document.getElementById('composerContentText');
    const feelingSelect = document.getElementById('composerFeelingSelect');
    const customFeeling = document.getElementById('composerCustomFeeling');
    const scoreRow = document.getElementById('composerScoreInputsRow');

    if (titleInput) titleInput.value = '';
    if (textArea) textArea.value = '';
    if (feelingSelect) feelingSelect.value = '';
    if (customFeeling) customFeeling.value = '';
    if (scoreRow) scoreRow.style.display = defaultType === 'score_brag' ? 'grid' : 'none';

    // Reset attachments
    state.composerImage = null;
    state.composerDocFile = null;
    updateComposerAttachmentsPreview();

    // User header in composer
    const userAvatarEl = document.getElementById('composerUserAvatar');
    const userNameEl = document.getElementById('composerUserName');
    if (userAvatarEl) userAvatarEl.src = getAvatarUrl(state.currentUser.username, state.currentUser.role, state.currentUser.avatar);
    if (userNameEl) userNameEl.textContent = state.currentUser.fullname || state.currentUser.username;

    modal.classList.add('open');
  }

  function closeComposer() {
    const modal = document.getElementById('composerModal');
    if (modal) modal.classList.remove('open');
  }

  function setComposerPostType(type) {
    state.composerPostType = type;
    updateComposerCategoryChips();

    const scoreRow = document.getElementById('composerScoreInputsRow');
    if (scoreRow) {
      scoreRow.style.display = type === 'score_brag' ? 'grid' : 'none';
    }

    const titleInput = document.getElementById('composerTitleInput');
    if (titleInput) {
      if (type === 'tip_trick') {
        titleInput.placeholder = 'Tiêu đề thủ thuật (Ví dụ: 10 Phím tắt Excel tăng tốc công việc...)';
      } else if (type === 'exercise_help') {
        titleInput.placeholder = 'Tiêu đề bài tập cần sửa (Ví dụ: Hỏi bài tập hàm VLOOKUP...)';
      } else {
        titleInput.placeholder = 'Tiêu đề bài viết (không bắt buộc)...';
      }
    }
  }

  function updateComposerCategoryChips() {
    const chips = document.querySelectorAll('.post-type-chip');
    chips.forEach(chip => {
      if (chip.getAttribute('data-type') === state.composerPostType) {
        chip.classList.add('active');
      } else {
        chip.classList.remove('active');
      }
    });
  }

  function handleComposerPhotoSelect(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (evt) {
      state.composerImage = { file, dataUrl: evt.target.result, name: file.name };
      updateComposerAttachmentsPreview();
    };
    reader.readAsDataURL(file);
  }

  function handleComposerDocSelect(e) {
    const file = e.target.files[0];
    if (!file) return;

    const ext = file.name.split('.').pop().toLowerCase();
    state.composerDocFile = { file, name: file.name, size: file.size, ext };
    updateComposerAttachmentsPreview();
  }

  function updateComposerAttachmentsPreview() {
    const area = document.getElementById('composerPreviewsArea');
    if (!area) return;

    let html = '';
    if (state.composerImage) {
      html += `
        <div class="preview-media-box">
          <img src="${state.composerImage.dataUrl}" alt="Preview" />
          <div class="btn-remove-preview" onclick="window.THVP_FORUM.removeComposerImage()" title="Xóa ảnh">✕</div>
        </div>
      `;
    }
    if (state.composerDocFile) {
      html += `
        <div class="preview-file-card">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span>📎</span>
            <strong>${escapeHtml(state.composerDocFile.name)}</strong>
            <small style="color: var(--text-sub);">(${formatFileSize(state.composerDocFile.size)})</small>
          </div>
          <button type="button" onclick="window.THVP_FORUM.removeComposerDocFile()" style="color: #ef4444; font-weight: 700; cursor: pointer;">✕</button>
        </div>
      `;
    }
    area.innerHTML = html;
  }

  function removeComposerImage() {
    state.composerImage = null;
    updateComposerAttachmentsPreview();
  }

  function removeComposerDocFile() {
    state.composerDocFile = null;
    updateComposerAttachmentsPreview();
  }

  function insertTagInComposer(tag) {
    const textarea = document.getElementById('composerContentText');
    if (textarea) {
      textarea.value += ' #' + tag + ' ';
      textarea.focus();
    }
  }

  async function submitPostFromComposer() {
    if (!state.currentUser) {
      triggerLoginPrompt('Vui lòng đăng nhập để đăng bài.');
      return;
    }

    const title = (document.getElementById('composerTitleInput')?.value || '').trim();
    const content = (document.getElementById('composerContentText')?.value || '').trim();
    const feelingSelect = document.getElementById('composerFeelingSelect')?.value || '';
    const customFeeling = (document.getElementById('composerCustomFeeling')?.value || '').trim();
    const feeling = customFeeling ? `đang cảm thấy ${customFeeling}` : feelingSelect;
    const groupName = document.getElementById('composerGroupSelect')?.value || '';

    let metaScore = null;
    if (state.composerPostType === 'score_brag') {
      const scoreVal = document.getElementById('composerScoreValue')?.value || '10.0';
      const subject = document.getElementById('composerScoreSubject')?.value || 'Tin Học Văn Phòng';
      metaScore = { score: scoreVal, subject: subject, exam: 'Bộ Đề Ôn Luyện Chuẩn Kỹ Năng', stars: 5 };
    }

    if (!content) {
      showToast('Vui lòng nhập nội dung bài viết!', 'warning');
      return;
    }

    // 1. Thử gửi qua API PHP
    try {
      const fd = new FormData();
      fd.append('author_name', state.currentUser.fullname || state.currentUser.username);
      fd.append('author_username', state.currentUser.username);
      fd.append('author_role', state.currentUser.role || 'student');
      fd.append('author_avatar', state.currentUser.avatar || '');
      fd.append('author_mssv', state.currentUser.mssv || '');
      fd.append('user_id', state.currentUser.id || 0);

      fd.append('title', title);
      fd.append('content', content);
      fd.append('post_type', state.composerPostType);
      fd.append('feeling', feeling);
      fd.append('group_name', groupName);
      if (metaScore) fd.append('meta_score', JSON.stringify(metaScore));

      if (state.composerImage && state.composerImage.file) {
        fd.append('image', state.composerImage.file);
      }
      if (state.composerDocFile && state.composerDocFile.file) {
        fd.append('file', state.composerDocFile.file);
      }

      const res = await fetch('api.php?action=forum_create_post', { method: 'POST', body: fd });
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          showToast('Đăng bài thành công!', 'success');
          closeComposer();
          state.page = 1;
          await loadPostsData();
          return;
        }
      }
    } catch (e) {}

    // 2. Fallback LocalStorage
    const localPosts = getLocalPosts();
    const extractedTags = Array.from(
      new Set((content.match(/#([a-zA-Z0-9_\u00C0-\u024F\u1E00-\u1EFF]+)/g) || []).map(t => t.slice(1)))
    ).join(',');
    const newPost = {
      id: Date.now(),
      user_id: state.currentUser.id || 0,
      author_name: state.currentUser.fullname || state.currentUser.username,
      author_username: state.currentUser.username,
      author_role: state.currentUser.role || 'student',
      author_avatar: state.currentUser.avatar || '',
      author_mssv: state.currentUser.mssv || '',
      post_type: state.composerPostType,
      title: title,
      content: content,
      feeling: feeling,
      tags: extractedTags,
      group_name: groupName,
      file_name: state.composerDocFile ? state.composerDocFile.name : '',
      file_size: state.composerDocFile ? state.composerDocFile.size : 0,
      image_name: state.composerImage ? state.composerImage.name : '',
      image_data: state.composerImage ? state.composerImage.dataUrl : null,
      meta_score: metaScore,
      reactions: { like: [], love: [], idea: [], wow: [], sad: [] },
      is_pinned: 0,
      views: 1,
      created_at: new Date().toISOString()
    };

    localPosts.unshift(newPost);
    localStorage.setItem(LOCAL_POSTS_KEY, JSON.stringify(localPosts));

    showToast('Đăng bài thành công!', 'success');
    closeComposer();
    state.page = 1;
    await loadPostsData();
  }

  async function deletePost(postId) {
    if (!state.currentUser) {
      triggerLoginPrompt('Vui lòng đăng nhập để thực hiện thao tác xóa bài viết.');
      return;
    }

    const targetPost = state.posts.find(p => Number(p.id) === Number(postId))
      || (state.allPostsCache || []).find(p => Number(p.id) === Number(postId))
      || getLocalPosts().find(p => Number(p.id) === Number(postId));

    if (targetPost && !canDeletePost(targetPost)) {
      showToast('Bạn không có quyền xóa bài viết của thành viên khác!', 'error');
      return;
    }

    const isTeacher = isTeacherAccount(state.currentUser.role, state.currentUser.username);
    const isAuthor = targetPost && String(state.currentUser.username || '').trim().toLowerCase() === String(targetPost.author_username || '').trim().toLowerCase();
    const confirmMsg = (isTeacher && targetPost && !isAuthor)
      ? `Bạn có chắc chắn muốn xóa bài viết của "${targetPost.author_name || 'học viên'}" với quyền Giáo viên không?`
      : 'Bạn có chắc chắn muốn xóa bài viết này không?';
    if (!confirm(confirmMsg)) return;

    // 1. Thử gọi API
    let apiHandled = false;
    try {
      const fd = new FormData();
      fd.append('id', postId);
      fd.append('username', state.currentUser.username);
      fd.append('role', state.currentUser.role || 'student');

      const res = await fetch('api.php?action=forum_delete_post', { method: 'POST', body: fd });
      if (res.ok) {
        const json = await res.json();
        apiHandled = true;
        if (json.success) {
          showToast('Đã xóa bài viết!', 'success');
          state.page = 1;
          await loadPostsData();
          return;
        }
        showToast(json.message || 'Bạn không có quyền xóa bài viết này!', 'error');
        return;
      }
    } catch (e) {
      if (apiHandled) return;
    }

    // 2. Fallback LocalStorage
    const allLocalPosts = getLocalPosts();
    const storedPost = allLocalPosts.find(p => Number(p.id) === Number(postId));
    if (storedPost && !canDeletePost(storedPost)) {
      showToast('Bạn không có quyền xóa bài viết của thành viên khác!', 'error');
      return;
    }

    const localPosts = allLocalPosts.filter(p => Number(p.id) !== Number(postId));
    localStorage.setItem(LOCAL_POSTS_KEY, JSON.stringify(localPosts));

    const remainingComments = getLocalComments().filter(c => Number(c.post_id) !== Number(postId));
    localStorage.setItem(LOCAL_COMMENTS_KEY, JSON.stringify(remainingComments));

    showToast('Đã xóa bài viết!', 'success');
    state.page = 1;
    await loadPostsData();
  }

  function sharePost(postId) {
    const url = window.location.origin + window.location.pathname + '#post-' + postId;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(() => {
        showToast('Đã sao chép liên kết bài viết vào bộ nhớ tạm!', 'success');
      });
    } else {
      showToast('Link bài viết: ' + url, 'info');
    }
  }

  // --- FILTERING & TABS ---
  function updateNavActiveState() {
    // 1. Reset class active ở tất cả các mục sidebar
    document.querySelectorAll('.forum-nav-item').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.trending-item').forEach(el => el.classList.remove('active'));

    // 2. Cập nhật các tab nằm ngang trên đầu Feed
    document.querySelectorAll('.tab-btn').forEach(btn => {
      const tabVal = btn.getAttribute('data-tab');
      if (tabVal === state.activeSort && !state.activeGroup && !state.activeTag) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    // 3. Highlight mục đang được chọn ở Sidebar (Duyệt an toàn không sợ lỗi ký tự đặc biệt)
    if (state.activeGroup) {
      document.querySelectorAll('.forum-nav-item').forEach(el => {
        const grp = el.getAttribute('data-group');
        if (grp && grp.trim().toLowerCase() === state.activeGroup.trim().toLowerCase()) {
          el.classList.add('active');
        }
      });
    } else if (state.activeTag) {
      const cleanTag = state.activeTag.replace('#', '').trim().toLowerCase();
      document.querySelectorAll('.forum-nav-item').forEach(el => {
        const nav = (el.getAttribute('data-nav') || '').trim().toLowerCase();
        if (nav === 'tag-' + cleanTag) {
          el.classList.add('active');
        }
      });
      document.querySelectorAll('.trending-item').forEach(el => {
        const t = (el.getAttribute('data-tag') || '').trim().toLowerCase();
        if (t === cleanTag) {
          el.classList.add('active');
        }
      });
    } else {
      // Sắp xếp bài viết (recent, hot, teacher, score)
      let found = false;
      document.querySelectorAll('.forum-nav-item').forEach(el => {
        const nav = el.getAttribute('data-nav');
        if (nav && nav === state.activeSort) {
          el.classList.add('active');
          found = true;
        }
      });
      if (!found && state.activeSort === 'recent') {
        const defaultAll = document.querySelector('.forum-nav-item[data-nav="recent"]');
        if (defaultAll) defaultAll.classList.add('active');
      }
    }
  }

  function setTab(sortTab) {
    state.activeSort = sortTab;
    state.activeGroup = '';
    state.activeTag = '';
    state.activeAuthor = '';
    state.page = 1;
    updateFilterIndicator();
    updateNavActiveState();
    loadPostsData();
  }

  function filterByTag(tag) {
    state.activeTag = tag;
    state.activeGroup = '';
    state.activeAuthor = '';
    state.activeSort = 'recent';
    state.page = 1;
    updateFilterIndicator();
    updateNavActiveState();
    loadPostsData();
  }

  function filterByGroup(groupName) {
    state.activeGroup = groupName;
    state.activeTag = '';
    state.activeAuthor = '';
    state.activeSort = 'recent';
    state.page = 1;
    updateFilterIndicator();
    updateNavActiveState();
    loadPostsData();
  }

  function clearActiveFilters() {
    state.activeSort = 'recent';
    state.activeTag = '';
    state.activeGroup = '';
    state.activeAuthor = '';
    state.searchKeyword = '';
    state.page = 1;
    updateFilterIndicator();
    updateNavActiveState();
    loadPostsData();
  }

  function updateFilterIndicator() {
    const alertBox = document.getElementById('activeFilterAlert');
    const txtBox = document.getElementById('activeFilterText');
    if (!alertBox || !txtBox) return;

    if (state.activeTag) {
      alertBox.style.display = 'flex';
      txtBox.innerHTML = `Đang lọc các bài theo chủ đề: <strong>#${escapeHtml(state.activeTag.replace('#', ''))}</strong>`;
    } else if (state.activeGroup) {
      alertBox.style.display = 'flex';
      txtBox.innerHTML = `Đang lọc theo nhóm: <strong>${escapeHtml(state.activeGroup)}</strong>`;
    } else if (state.activeAuthor) {
      alertBox.style.display = 'flex';
      txtBox.innerHTML = `Đang xem bài viết của: <strong>@${escapeHtml(state.activeAuthor)}</strong>`;
    } else {
      alertBox.style.display = 'none';
    }
  }

  // --- PROFILE WALL (TRANG CÁ NHÂN / TƯỜNG) ---
  function getLocalBios() {
    try {
      return JSON.parse(localStorage.getItem(LOCAL_BIOS_KEY) || '{}');
    } catch (e) {
      return {};
    }
  }

  async function openProfileWall(username) {
    const backdrop = document.getElementById('profileWallModal');
    if (!backdrop) return;

    let profileData = null;

    // 1. Thử gọi API
    try {
      const res = await fetch(`api.php?action=forum_get_profile&username=${encodeURIComponent(username)}`);
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) profileData = json.data;
      }
    } catch (e) {}

    const allLocalPosts = getLocalPosts();
    const allLocalComments = getLocalComments();
    const savedBios = getLocalBios();
    const unameLower = String(username || '').toLowerCase();

    const matchedLocalPosts = allLocalPosts.filter(
      p => String(p.author_username || '').toLowerCase() === unameLower
    );
    const matchedLocalComments = allLocalComments.filter(
      c => String(c.author_username || '').toLowerCase() === unameLower
    );

    // 2. Fallback hoàn toàn từ dữ liệu thật (không tạo giả bài viết/điểm/huy hiệu)
    if (!profileData) {
      const isMe = state.currentUser && String(state.currentUser.username || '').toLowerCase() === unameLower;
      const samplePost = matchedLocalPosts[0] || null;
      const sampleComment = matchedLocalComments[0] || null;
      const inferredRole = isMe
        ? (state.currentUser.role || 'student')
        : (samplePost?.author_role || sampleComment?.author_role || (unameLower === 'giangvien' ? 'admin' : 'student'));
      const inferredName = isMe
        ? (state.currentUser.fullname || state.currentUser.username)
        : (samplePost?.author_name || sampleComment?.author_name || username);
      const inferredMssv = isMe ? (state.currentUser.mssv || '') : '';
      const inferredAvatar = isMe
        ? (state.currentUser.avatar || '')
        : (samplePost?.author_avatar || sampleComment?.author_avatar || '');

      const appreciationCount = matchedLocalPosts.reduce((sum, p) => {
        return sum + Object.values(p.reactions || {}).reduce(
          (s, arr) => s + (Array.isArray(arr) ? arr.length : 0),
          0
        );
      }, 0);

      const earnedBadges = [];
      if (matchedLocalPosts.length >= 1) {
        earnedBadges.push({ name: 'Thành viên đóng góp', icon: '✍️', desc: 'Đã đăng bài thảo luận trên diễn đàn' });
      }
      if (matchedLocalPosts.some(p => p.post_type === 'score_brag' || p.meta_score)) {
        earnedBadges.push({ name: 'Chia sẻ thành tích', icon: '🏆', desc: 'Đã chia sẻ kết quả ôn luyện thi thử' });
      }

      profileData = {
        user: {
          username: username,
          fullname: inferredName,
          role: inferredRole,
          mssv: inferredMssv,
          avatar: inferredAvatar,
          bio: savedBios[unameLower] || ''
        },
        stats: {
          posts_count: matchedLocalPosts.length,
          comments_count: matchedLocalComments.length,
          appreciation_count: appreciationCount
        },
        badges: earnedBadges,
        posts: matchedLocalPosts
      };
    }

    const u = profileData.user || { username };
    const isTeacher = isTeacherAccount(u.role, u.username);
    const roleHtml = isTeacher ? `<span class="role-badge teacher">Giảng viên</span>` : `<span class="role-badge student">Học viên</span>`;
    const avatar = getAvatarUrl(u.username, u.role, u.avatar);
    const displayBio = u.bio || savedBios[unameLower] || '';
    const userPosts = Array.isArray(profileData.posts) ? profileData.posts : matchedLocalPosts;
    const stats = profileData.stats || {};
    const postsCount = stats.posts_count !== undefined ? stats.posts_count : userPosts.length;
    const commentsCount = stats.comments_count !== undefined ? stats.comments_count : 0;

    let userPostsHtml = '';
    if (userPosts.length === 0) {
      userPostsHtml = `<div style="text-align: center; color: var(--text-sub); padding: 20px;">Thành viên này chưa đăng bài viết nào trên cộng đồng.</div>`;
    } else {
      userPosts.forEach(p => {
        userPostsHtml += createPostCardHtml(p);
      });
    }

    const badgesList = Array.isArray(profileData.badges) ? profileData.badges : [];
    const badgesHtml = badgesList.length === 0
      ? `<div class="forum-empty-note" style="grid-column: 1 / -1;">Chưa có huy hiệu nào.</div>`
      : badgesList.map(b => `
          <div class="badge-card">
            <span class="badge-icon">${b.icon}</span>
            <span class="badge-name">${escapeHtml(b.name)}</span>
            <span class="badge-desc">${escapeHtml(b.desc)}</span>
          </div>
        `).join('');

    const bodyEl = document.getElementById('profileWallBody');
    if (bodyEl) {
      const canEditBio = state.currentUser && String(state.currentUser.username || '').toLowerCase() === unameLower;
      bodyEl.innerHTML = `
        <!-- Cover Banner Header -->
        <div class="profile-wall-cover">
          <div class="wall-cover-pattern"></div>
          <div class="wall-cover-badge">
            <span class="badge-dot"></span>
            <span>Cộng Đồng Học Tập Tin Học Văn Phòng</span>
          </div>
        </div>

        <div class="wall-main-content">
          <div class="wall-avatar-container">
            <div class="wall-avatar-wrap">
              <img src="${avatar}" class="wall-avatar-big" id="wallUserAvatarImg" alt="${escapeHtml(u.fullname || u.username)}" />
              ${canEditBio ? `
                <button type="button" class="btn-avatar-camera" onclick="window.THVP_FORUM.openAvatarModal()" title="Thay đổi ảnh đại diện">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                    <circle cx="12" cy="13" r="4"/>
                  </svg>
                </button>
              ` : ''}
            </div>
            
            <div class="wall-action-btns-row">
              ${canEditBio ? `
                <button type="button" class="btn-action-change-avatar" onclick="window.THVP_FORUM.openAvatarModal()">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                    <circle cx="12" cy="13" r="4"/>
                  </svg>
                  <span>Đổi Ảnh Đại Diện</span>
                </button>
                <button type="button" class="btn-clear-filter" onclick="window.THVP_FORUM.startEditBio()">
                  ✏️ Sửa Tiểu Sử
                </button>
              ` : ''}
            </div>
          </div>
          
          <div class="wall-user-title-box">
            <h2>${escapeHtml(u.fullname || u.username)} ${roleHtml}</h2>
            <div class="wall-user-sub">${u.mssv ? 'Mã định danh: ' + escapeHtml(u.mssv) + ' • ' : ''}@${escapeHtml(u.username)}</div>
          </div>

          <!-- Khung Tiểu Sử Cá Nhân Trực Tiếp -->
          <div class="wall-bio-container" id="wallBioContainer">
            <div class="wall-bio-view" id="wallBioView">
              <div
                class="wall-bio-content ${canEditBio ? 'can-edit' : ''} ${!displayBio ? 'is-empty' : ''}"
                id="wallBioDisplay"
                ${canEditBio ? 'onclick="window.THVP_FORUM.startEditBio()"' : ''}
                title="${canEditBio ? 'Bấm để chỉnh sửa tiểu sử trực tiếp' : ''}"
              >${escapeHtml(displayBio || (canEditBio ? 'Chưa cập nhật tiểu sử. Bấm vào đây để giới thiệu đôi nét về bản thân ✨' : 'Chưa cập nhật tiểu sử.'))}</div>
              ${canEditBio ? `
                <button type="button" class="btn-edit-bio-inline" onclick="window.THVP_FORUM.startEditBio()">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 20h9"/>
                    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
                  </svg>
                  <span>Chỉnh sửa tiểu sử</span>
                </button>
              ` : ''}
            </div>

            ${canEditBio ? `
              <div class="wall-bio-editor" id="wallBioEditor" style="display: none;">
                <div class="wall-bio-editor-header">
                  <span class="wall-bio-editor-title">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                      <path d="M12 20h9"/>
                      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
                    </svg>
                    Chỉnh sửa tiểu sử bản thân
                  </span>
                  <span class="wall-bio-char-count" id="wallBioCharCount">0/200</span>
                </div>
                <textarea
                  id="wallBioInput"
                  class="wall-bio-textarea"
                  maxlength="200"
                  rows="3"
                  placeholder="Chia sẻ về sở thích tin học, chuyên môn (Word/Excel/PowerPoint), mục tiêu học tập..."
                  oninput="window.THVP_FORUM.onBioInput(this)"
                  onkeydown="window.THVP_FORUM.handleBioKeyDown(event)"
                ></textarea>
                <div class="wall-bio-quick-chips">
                  <span class="bio-chip-label">Gợi ý nhanh:</span>
                  <button type="button" class="bio-quick-chip" onclick="window.THVP_FORUM.appendBioChip('Đam mê tự động hóa Excel 📊')">📊 Đam mê Excel</button>
                  <button type="button" class="bio-quick-chip" onclick="window.THVP_FORUM.appendBioChip('Luyện gõ 10 ngón thần tốc ⚡')">⚡ Gõ phím thần tốc</button>
                  <button type="button" class="bio-quick-chip" onclick="window.THVP_FORUM.appendBioChip('Mục tiêu đạt điểm 10 Chuẩn CNTT 🌟')">🌟 Mục tiêu điểm 10</button>
                  <button type="button" class="bio-quick-chip" onclick="window.THVP_FORUM.appendBioChip('Thích thiết kế Slide PowerPoint hiện đại 🎨')">🎨 Slide PowerPoint</button>
                </div>
                <div class="wall-bio-actions">
                  <button type="button" class="btn-bio-cancel" onclick="window.THVP_FORUM.cancelEditBio()">Hủy</button>
                  <button type="button" class="btn-bio-save" onclick="window.THVP_FORUM.saveBioInline()">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                      <polyline points="17 21 17 13 7 13 7 21"/>
                      <polyline points="7 3 7 8 15 8"/>
                    </svg>
                    Lưu tiểu sử
                  </button>
                </div>
              </div>
            ` : ''}
          </div>

          <div class="mini-profile-stats" style="margin-bottom: 20px;">
            <div>
              <div class="stat-item-num">${postsCount}</div>
              <div class="stat-item-label">Bài viết đã đăng</div>
            </div>
            <div>
              <div class="stat-item-num">${commentsCount}</div>
              <div class="stat-item-label">Bình luận giúp bạn bè</div>
            </div>
          </div>

          <!-- Badges Showcase -->
          <div class="wall-badges-box">
            <div class="wall-badges-title">Huy hiệu danh dự đạt được</div>
            <div class="badges-grid">${badgesHtml}</div>
          </div>

          <!-- Post History -->
          <div class="wall-posts-header">Lịch sử bài viết trên Dòng thời gian (${userPosts.length})</div>
          <div class="forum-feed-list">${userPostsHtml}</div>
        </div>
      `;
    }

    backdrop.classList.add('open');
  }

  function closeProfileWall() {
    cancelEditBio();
    const backdrop = document.getElementById('profileWallModal');
    if (backdrop) backdrop.classList.remove('open');
  }

  function startEditBio() {
    const viewEl = document.getElementById('wallBioView');
    const editorEl = document.getElementById('wallBioEditor');
    const inputEl = document.getElementById('wallBioInput');
    const countEl = document.getElementById('wallBioCharCount');
    if (!editorEl || !inputEl) return;

    const bioEl = document.getElementById('wallBioDisplay');
    const rawCurBio = bioEl ? bioEl.textContent.trim() : '';
    const isEmptyHint = !rawCurBio || rawCurBio.startsWith('Chưa cập nhật tiểu sử.');
    const curBio = isEmptyHint ? '' : rawCurBio;

    inputEl.value = curBio;
    if (countEl) countEl.textContent = `${inputEl.value.length}/200`;
    if (viewEl) viewEl.style.display = 'none';
    editorEl.style.display = 'flex';
    inputEl.focus();
    inputEl.setSelectionRange(inputEl.value.length, inputEl.value.length);
  }

  function cancelEditBio() {
    const viewEl = document.getElementById('wallBioView');
    const editorEl = document.getElementById('wallBioEditor');
    if (editorEl) editorEl.style.display = 'none';
    if (viewEl) viewEl.style.display = 'flex';
  }

  function onBioInput(textarea) {
    const countEl = document.getElementById('wallBioCharCount');
    if (countEl && textarea) {
      countEl.textContent = `${textarea.value.length}/200`;
    }
  }

  function appendBioChip(text) {
    const inputEl = document.getElementById('wallBioInput');
    if (!inputEl) return;
    const current = inputEl.value.trim();
    if (!current) {
      inputEl.value = text;
    } else if (!current.includes(text)) {
      if (current.length + text.length + 3 <= 200) {
        inputEl.value = `${current} • ${text}`;
      } else {
        inputEl.value = text;
      }
    }
    onBioInput(inputEl);
    inputEl.focus();
  }

  function handleBioKeyDown(e) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      cancelEditBio();
    } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      saveBioInline();
    }
  }

  function saveBioInline() {
    const inputEl = document.getElementById('wallBioInput');
    const newBio = inputEl ? inputEl.value.trim() : '';
    if (!state.currentUser || !state.currentUser.username) {
      triggerLoginPrompt('Vui lòng đăng nhập để lưu tiểu sử.');
      return;
    }

    const uname = state.currentUser.username.toLowerCase();
    const bios = getLocalBios();
    bios[uname] = newBio;
    localStorage.setItem(LOCAL_BIOS_KEY, JSON.stringify(bios));

    const bioEl = document.getElementById('wallBioDisplay');
    if (bioEl) {
      if (newBio) {
        bioEl.textContent = newBio;
        bioEl.classList.remove('is-empty');
      } else {
        bioEl.textContent = 'Chưa cập nhật tiểu sử. Bấm vào đây để giới thiệu đôi nét về bản thân ✨';
        bioEl.classList.add('is-empty');
      }
    }

    cancelEditBio();
    showToast('Đã lưu tiểu sử mới thành công! ✨', 'success');
  }

  function editBioPrompt() {
    startEditBio();
  }

  // --- AVATAR CHOOSER MODAL (ĐỔI ẢNH ĐẠI DIỆN) ---
  function openAvatarModal() {
    if (!state.currentUser) {
      triggerLoginPrompt('Vui lòng đăng nhập để thay đổi ảnh đại diện.');
      return;
    }

    const modal = document.getElementById('avatarChooserModal');
    if (!modal) return;

    const curAvatar = getAvatarUrl(state.currentUser.username, state.currentUser.role, state.currentUser.avatar);
    state.selectedAvatarCandidate = curAvatar;

    const previewImg = document.getElementById('avatarModalPreviewImg');
    const previewName = document.getElementById('avatarModalPreviewName');
    if (previewImg) previewImg.src = curAvatar;
    if (previewName) previewName.textContent = state.currentUser.fullname || state.currentUser.username;

    // Render presets grid
    const gridEl = document.getElementById('avatarPresetsGrid');
    if (gridEl) {
      gridEl.innerHTML = PRESET_AVATARS.map((p, idx) => {
        const isSelected = p.url === curAvatar;
        return `
          <div class="avatar-preset-item ${isSelected ? 'selected' : ''}" data-idx="${idx}" onclick="window.THVP_FORUM.selectPresetAvatar('${escapeJsAttr(p.url)}', this)">
            <img src="${p.url}" alt="${escapeHtml(p.name)}" />
            <div class="avatar-preset-label">${escapeHtml(p.name)}</div>
          </div>
        `;
      }).join('');
    }

    // Reset file input
    const fileInput = document.getElementById('avatarFileInput');
    if (fileInput) fileInput.value = '';

    modal.classList.add('open');
  }

  function closeAvatarModal() {
    const modal = document.getElementById('avatarChooserModal');
    if (modal) modal.classList.remove('open');
    state.selectedAvatarCandidate = null;
  }

  function selectPresetAvatar(url, el) {
    state.selectedAvatarCandidate = url;
    const previewImg = document.getElementById('avatarModalPreviewImg');
    if (previewImg) previewImg.src = url;

    document.querySelectorAll('.avatar-preset-item').forEach(item => item.classList.remove('selected'));
    if (el) el.classList.add('selected');
  }

  function handleAvatarFileSelect(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      showToast('Vui lòng chọn tệp hình ảnh hợp lệ (JPG, PNG, WebP)!', 'warning');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      showToast('Kích thước ảnh tối đa là 5MB. Vui lòng chọn ảnh nhỏ hơn!', 'warning');
      return;
    }

    const reader = new FileReader();
    reader.onload = function (evt) {
      const img = new Image();
      img.onload = function () {
        // Tạo canvas vuông 200x200 để canh tâm chuẩn tỉ lệ avatar
        const canvas = document.createElement('canvas');
        const size = 200;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');

        const minDim = Math.min(img.width, img.height);
        const sx = (img.width - minDim) / 2;
        const sy = (img.height - minDim) / 2;

        ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, size, size);
        const squareDataUrl = canvas.toDataURL('image/jpeg', 0.88);

        state.selectedAvatarCandidate = squareDataUrl;
        const previewImg = document.getElementById('avatarModalPreviewImg');
        if (previewImg) previewImg.src = squareDataUrl;

        document.querySelectorAll('.avatar-preset-item').forEach(item => item.classList.remove('selected'));
        showToast('Đã chọn ảnh! Bấm "Lưu Ảnh Đại Diện" để áp dụng.', 'info');
      };
      img.src = evt.target.result;
    };
    reader.readAsDataURL(file);
  }

  function saveAvatarSelection() {
    if (!state.selectedAvatarCandidate) {
      showToast('Vui lòng chọn hoặc tải ảnh đại diện!', 'warning');
      return;
    }
    if (!state.currentUser || !state.currentUser.username) {
      triggerLoginPrompt('Vui lòng đăng nhập để lưu ảnh đại diện.');
      return;
    }

    const newAvatar = state.selectedAvatarCandidate;
    const uname = String(state.currentUser.username).toLowerCase();

    // 1. Lưu vào Custom Avatars Map trong LocalStorage
    const avatars = getLocalAvatars();
    avatars[uname] = newAvatar;
    localStorage.setItem(LOCAL_AVATARS_KEY, JSON.stringify(avatars));

    // 2. Cập nhật state & Auth
    state.currentUser.avatar = newAvatar;
    if (window.THVP_AUTH && typeof window.THVP_AUTH.setCurrentUser === 'function') {
      const u = window.THVP_AUTH.getCurrentUser();
      if (u) {
        window.THVP_AUTH.setCurrentUser({ ...u, avatar: newAvatar }, true);
      }
    }

    // 3. Cập nhật giao diện tức thì
    const wallImg = document.getElementById('wallUserAvatarImg');
    if (wallImg) wallImg.src = newAvatar;

    updateCurrentUserDisplay();

    // 4. Cập nhật các bài viết & bình luận của người này trong LocalStorage
    const localPosts = getLocalPosts();
    let postChanged = false;
    localPosts.forEach(p => {
      if (String(p.author_username || '').toLowerCase() === uname) {
        p.author_avatar = newAvatar;
        postChanged = true;
      }
    });
    if (postChanged) {
      localStorage.setItem(LOCAL_POSTS_KEY, JSON.stringify(localPosts));
    }

    const localComments = getLocalComments();
    let cmtChanged = false;
    localComments.forEach(c => {
      if (String(c.author_username || '').toLowerCase() === uname) {
        c.author_avatar = newAvatar;
        cmtChanged = true;
      }
    });
    if (cmtChanged) {
      localStorage.setItem(LOCAL_COMMENTS_KEY, JSON.stringify(localComments));
    }

    // Re-render feed với avatar mới
    state.posts.forEach(p => {
      if (String(p.author_username || '').toLowerCase() === uname) {
        p.author_avatar = newAvatar;
      }
    });
    renderFeed();

    closeAvatarModal();
    showToast('Đã đổi ảnh đại diện thành công! 📸', 'success');
  }

  // --- LIGHTBOX ---
  function openLightbox(src) {
    const modal = document.getElementById('lightboxModal');
    const img = document.getElementById('lightboxImg');
    if (modal && img) {
      img.src = src;
      modal.classList.add('open');
    }
  }

  function closeLightbox() {
    const modal = document.getElementById('lightboxModal');
    if (modal) modal.classList.remove('open');
  }

  // --- EVENT LISTENERS INITIALIZATION ---
  function initEvents() {
    // Lắng nghe thay đổi tài khoản từ auth.js
    window.addEventListener('thvp:auth_change', evt => {
      const nextUser = (evt && evt.detail && Object.prototype.hasOwnProperty.call(evt.detail, 'user'))
        ? evt.detail.user
        : (window.THVP_AUTH ? window.THVP_AUTH.getCurrentUser() : null);
      const nextKey = nextUser ? `${nextUser.username || ''}:${nextUser.role || ''}` : '';
      const changed = nextKey !== state.lastAuthUserKey;
      state.lastAuthUserKey = nextKey;
      updateCurrentUserDisplay();
      renderOnlineUsers();
      if (state.initialLoadDone && changed) {
        state.page = 1;
        loadPostsData();
      }
    });

    // Lắng nghe click chuyển tab / nhóm ở Sidebar để đổi màu active ngay tức thì
    document.addEventListener('click', e => {
      const navBtn = e.target.closest('.forum-nav-item button, .forum-nav-item a');
      if (navBtn) {
        const li = navBtn.closest('.forum-nav-item');
        if (li) {
          document.querySelectorAll('.forum-nav-item').forEach(item => item.classList.remove('active'));
          document.querySelectorAll('.trending-item').forEach(item => item.classList.remove('active'));
          li.classList.add('active');
        }
      }

      const trendItem = e.target.closest('.trending-item');
      if (trendItem) {
        document.querySelectorAll('.forum-nav-item').forEach(item => item.classList.remove('active'));
        document.querySelectorAll('.trending-item').forEach(item => item.classList.remove('active'));
        trendItem.classList.add('active');
      }
    });

    // Lắng nghe click vào các hashtag # bên trong nội dung bài viết
    document.addEventListener('click', e => {
      const tagLink = e.target.closest('.tag-link');
      if (tagLink) {
        e.preventDefault();
        const tag = tagLink.getAttribute('data-tag');
        if (tag) window.THVP_FORUM.filterByTag(tag);
      }
    });

    // Close modals khi click ra ngoài backdrop
    document.addEventListener('click', e => {
      if (e.target.classList.contains('composer-modal-backdrop')) closeComposer();
      if (e.target.classList.contains('profile-wall-backdrop')) closeProfileWall();
      if (e.target.classList.contains('avatar-modal-backdrop')) closeAvatarModal();
      if (e.target.classList.contains('lightbox-modal')) closeLightbox();
      if (e.target.classList.contains('login-prompt-dialog')) {
        document.getElementById('loginPromptDialog')?.classList.remove('open');
      }
    });

    // ESC to close modals
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        const avatarModal = document.getElementById('avatarChooserModal');
        if (avatarModal && avatarModal.classList.contains('open')) {
          closeAvatarModal();
          return;
        }
        const bioEditor = document.getElementById('wallBioEditor');
        if (bioEditor && bioEditor.style.display !== 'none') {
          cancelEditBio();
          return;
        }
        closeComposer();
        closeProfileWall();
        closeLightbox();
        document.getElementById('loginPromptDialog')?.classList.remove('open');
      }
    });
  }

  // Global Exports for HTML inline onclick
  window.THVP_FORUM = {
    setTab,
    filterByTag,
    filterByGroup,
    clearActiveFilters,
    openComposer,
    closeComposer,
    setComposerPostType,
    handleComposerPhotoSelect,
    handleComposerDocSelect,
    removeComposerImage,
    removeComposerDocFile,
    insertTagInComposer,
    submitPostFromComposer,
    deletePost,
    sharePost,
    handleQuickReaction,
    submitReaction,
    toggleComments,
    handleCommentKeyDown,
    handleCommentImageSelect,
    removeCommentImage,
    insertMentionInComment,
    prepareReply,
    cancelReply,
    submitComment,
    reactComment,
    openProfileWall,
    closeProfileWall,
    startEditBio,
    cancelEditBio,
    saveBioInline,
    appendBioChip,
    onBioInput,
    handleBioKeyDown,
    editBioPrompt,
    openAvatarModal,
    closeAvatarModal,
    selectPresetAvatar,
    handleAvatarFileSelect,
    saveAvatarSelection,
    openLightbox,
    closeLightbox,
    loadMorePosts: () => {
      state.page++;
      loadPostsData();
    }
  };

  // Auto-init on DOM ready
  document.addEventListener('DOMContentLoaded', () => {
    clearLegacySeedData();
    const curUser = window.THVP_AUTH ? window.THVP_AUTH.getCurrentUser() : null;
    state.lastAuthUserKey = curUser ? `${curUser.username || ''}:${curUser.role || ''}` : '';
    updateCurrentUserDisplay();
    updateNavActiveState();
    renderSidebarWidgets();
    initEvents();
    loadPostsData().then(() => {
      state.initialLoadDone = true;
    });

    // Tự động mở hộp thoại Khoe Điểm nếu vừa hoàn thành bài thi bên trang Ôn Luyện
    const urlParams = new URLSearchParams(window.location.search);
    const pendingBrag = sessionStorage.getItem('thvp_share_score_brag');
    if (urlParams.get('action') === 'share_score' || pendingBrag) {
      setTimeout(() => {
        let bragData = null;
        try { bragData = pendingBrag ? JSON.parse(pendingBrag) : null; } catch (e) {}
        openComposer('score_brag');
        if (bragData) {
          const scoreInput = document.getElementById('composerScoreValue');
          const subjectInput = document.getElementById('composerScoreSubject');
          const contentArea = document.getElementById('composerContentText');
          const feelingSel = document.getElementById('composerFeelingSelect');
          if (scoreInput) scoreInput.value = bragData.score || '10.0';
          if (subjectInput) subjectInput.value = bragData.subject || 'Tin Học Văn Phòng';
          if (contentArea) contentArea.value = `Mình vừa hoàn thành bài thi thử "${bragData.subject || 'Trắc nghiệm'}" đạt ${bragData.score || '10'}/10 điểm! Mọi người cùng vào ôn luyện nhé! 🏆 #KhoeThanhTich #OnLuyenThiThu`;
          if (feelingSel) feelingSel.value = 'đang cảm thấy phấn khởi vì đạt điểm 10 🌟';
          sessionStorage.removeItem('thvp_share_score_brag');
        }
      }, 400);
    }
  });
})();

