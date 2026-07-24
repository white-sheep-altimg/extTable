/* ── 状態管理（IIFEでカプセル化） ── */
(function () {
  'use strict';

  // ── グローバル変数（要件通り外部からアクセス可能） ──
  var allRows = [];           // 全件データ
  var filteredRows = [];      // フィルター後データ

  // ── 設定 ──
  var PAGE_SIZE = 5;          // 1ページあたりの件数（変更可能）
  var STATUS_OPTS = ['在籍', '休職', '退職'];

  // ── localStorageキー ──
  var STORAGE_KEY = 'extTable_data';
  var STORAGE_KEY_COMMENTS = 'extTable_comments';

  // ── コメントデータ: { "rowId-colKey": "コメント本文" } ──
  var comments = {};

  // ── 現在表示中のツールチップ情報 ──
  var activeTooltip = { rowId: null, colKey: null, el: null };

  // ── データ保存（localStorage） ──
  function saveData() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        columns: columns,
        rows: allRows
      }));
    } catch (e) {
      console.warn('データの保存に失敗しました:', e);
    }
  }

  // ── コメントの保存（localStorage） ──
  function saveComments() {
    try {
      localStorage.setItem(STORAGE_KEY_COMMENTS, JSON.stringify(comments));
    } catch (e) {
      console.warn('コメントの保存に失敗しました:', e);
    }
  }

  // ── コメントの読み込み（localStorage） ──
  function loadComments() {
    try {
      var saved = localStorage.getItem(STORAGE_KEY_COMMENTS);
      if (saved) { comments = JSON.parse(saved); }
    } catch (e) { /* ignore */ }
  }

  // ── 編集後のデータをJSONファイルとしてダウンロード ──
  function exportJSON() {
    var data = JSON.stringify({ columns: columns, rows: allRows }, null, 2);
    var blob = new Blob([data], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    var now = new Date();
    var ts = now.getFullYear()
      + String(now.getMonth() + 1).padStart(2, '0')
      + String(now.getDate()).padStart(2, '0')
      + '-' + String(now.getHours()).padStart(2, '0')
      + String(now.getMinutes()).padStart(2, '0');
    a.href = url;
    a.download = 'data_' + ts + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ── コメントをJSONファイルとしてダウンロード ──
  function exportComments() {
    var data = JSON.stringify(comments, null, 2);
    var blob = new Blob([data], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    var now = new Date();
    var ts = now.getFullYear()
      + String(now.getMonth() + 1).padStart(2, '0')
      + String(now.getDate()).padStart(2, '0')
      + '-' + String(now.getHours()).padStart(2, '0')
      + String(now.getMinutes()).padStart(2, '0');
    a.href = url;
    a.download = 'comments_' + ts + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ── コメントをJSONファイルから読み込み ──
  function importComments() {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.addEventListener('change', function (e) {
      var file = e.target.files[0];
      if (!file) { return; }
      var reader = new FileReader();
      reader.onload = function (ev) {
        try {
          var data = JSON.parse(ev.target.result);
          if (typeof data === 'object' && data !== null) {
            comments = data;
            saveComments();
            alert('コメントを読み込みました。');
          } else {
            alert('無効なファイル形式です。');
          }
        } catch (err) {
          alert('ファイルの読み込みに失敗しました: ' + err.message);
        }
      };
      reader.readAsText(file);
    });
    input.click();
  }

  // ── 現在ページ ──
  var currentPage = 1;

  // ── ソート状態 ──
  var sortCol = null;   // ソート対象カラムの key
  var sortDir = 0;      // 0=なし, 1=昇順, 2=降順

  // ── グローバル検索 ──
  var globalSearch = '';  // 検索テキスト

  // ── DOMハンドル ──
  var theadRow, tbody, filterSelect, searchInput, pageSizeSelect, pagInfo, pagBtns, emptyMsg;

  // ── 初期化 ──
  function init() {
    theadRow = document.getElementById('js-thead-row');
    tbody = document.getElementById('js-tbody');
    filterSelect = document.getElementById('js-dept-filter');
    searchInput = document.getElementById('js-search-input');
    pageSizeSelect = document.getElementById('js-pagesize-select');
    pagInfo = document.getElementById('js-pag-info');
    pagBtns = document.getElementById('js-pag-btns');
    emptyMsg = document.getElementById('js-empty-msg');

    loadComments();  // コメントをlocalStorageから読み込み
    loadJSON('./data/data.json');
  }

  // ── JSONファイル取得 ──
  function loadJSON(jsonfile) {
    fetch(jsonfile)
      .then(function (res) {
        if (!res.ok) { throw new Error('HTTP ' + res.status); }
        return res.json();
      })
      .then(function (data) {
        // localStorageに保存済みのデータがある場合はそれを優先（編集後のデータが優先）
        var saved = null;
        try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch (e) { /* ignore */ }
        if (saved && saved.rows && saved.rows.length > 0) {
          allRows = saved.rows.slice();
          columns = saved.columns;
        } else {
          allRows = data.rows.slice();
          columns = data.columns;
        }
        filteredRows = allRows.slice();        // 最初は全件
        populateDeptFilter(allRows);           // 部署ドロップダウン自動生成
        currentPage = 1;                       // ページリセット
        render();                              // 初回描画
      })
      .catch(function (err) {
        console.error('データ読み込みエラー:', err);
        tbody.textContent = '';
        var tr = document.createElement('tr');
        var td = document.createElement('td');
        td.colSpan = '6';
        td.style.cssText = 'text-align:center;color:#9b1c1c;padding:24px;';
        td.textContent = 'データを読み込めませんでした。';
        tr.appendChild(td);
        tbody.appendChild(tr);
      });
  }

  // ── ヘッダー描画 ──
  function renderHeader(cols) {
    columns = cols;  // renderBodyで参照するため保持
    theadRow.innerHTML = '';
    columns.forEach(function (col) {
      var th = document.createElement('th');
      th.textContent = col.label;
      if (col.width) { th.style.width = col.width; }

      // ソートインジケーター表示
      if (sortCol === col.key) {
        var icon = document.createElement('span');
        icon.className = 'tbl-sort-icon';
        icon.textContent = sortDir === 1 ? ' ▲' : sortDir === 2 ? ' ▼' : '';
        th.appendChild(icon);
        th.setAttribute('aria-sort', sortDir === 1 ? 'ascending' : sortDir === 2 ? 'descending' : 'none');
      } else {
        th.setAttribute('aria-sort', 'none');
      }

      // 編集可能または ID 列はソート対象とする
      if (col.editable || col.key === 'id') {
        th.setAttribute('data-sortable', 'true');
        th.setAttribute('data-col-key', col.key);
      }
      if (col.editable) {
        var hint = document.createElement('span');
        hint.className = 'tbl-edit-hint';
        hint.textContent = '✎';  // ✎
        th.appendChild(hint);
      }
      theadRow.appendChild(th);
    });
  }

  // ── 部署ドロップダウン自動生成 ──
  function populateDeptFilter(rows) {
    // 重複なし部署名を収集
    var depts = [];
    var seen = {};
    for (var i = 0; i < rows.length; i++) {
      var d = rows[i].department;
      if (d && !seen[d]) {
        seen[d] = true;
        depts.push(d);
      }
    }
    depts.sort();  // 五十音順

    depts.forEach(function (dept) {
      var option = document.createElement('option');
      option.value = dept;
      option.textContent = dept;
      filterSelect.appendChild(option);
    });

    // 変更イベント
    filterSelect.addEventListener('change', function () {
      sortCol = null;  // フィルター時はソート状態をリセット
      sortDir = 0;
      currentPage = 1;
      applyFilters();
      render();
    });
  }

  // ── 基本フィルター適用（部署＋検索のAND条件） ──
  function applyFilters() {
    var query = globalSearch.toLowerCase();

    filteredRows = allRows.filter(function (row) {
      // 部署フィルター
      var dept = filterSelect.value;
      if (dept !== '' && row.department !== dept) {
        return false;
      }
      // 検索フィルター
      if (query !== '') {
        var matched = false;
        for (var i = 0; i < columns.length; i++) {
          var val = String(row[columns[i].key] != null ? row[columns[i].key] : '');
          if (val.toLowerCase().indexOf(query) !== -1) {
            matched = true;
            break;
          }
        }
        if (!matched) { return false; }
      }
      return true;
    });
  }

  // ── ソート適用 ──
  function applySort() {
    if (sortCol === null || sortDir === 0) {
      return;  // ソートなしはフィルター結果をそのまま維持
    }

    var col = null;
    for (var i = 0; i < columns.length; i++) {
      if (columns[i].key === sortCol) { col = columns[i]; break; }
    }
    if (!col) { return; }

    // コピーしてからソート（元の配列を不変に保つ）
    filteredRows = filteredRows.slice().sort(function (a, b) {
      var va = a[sortCol];
      var vb = b[sortCol];
      if (va == null) { return 1; }
      if (vb == null) { return -1; }

      var cmp;
      // id 列は数値比較、他は文字列比較（日本語対応）
      if (sortCol === 'id') {
        cmp = Number(va) - Number(vb);
      } else {
        cmp = String(va).localeCompare(String(vb), 'ja');
      }
      return sortDir === 2 ? -cmp : cmp;  // 降順なら反転
    });
  }

  // ── 本体描画（ソート適用→ヘッダ更新→ページネーション含む） ──
  function render() {
    applySort();      // ソート状態を適用
    renderHeader(columns);  // ソートインジケーター再描画
    renderBody();
    renderPagination();
    renderInfo();
  }

  // ──  tbody 描画（現在ページの行のみ） ──
  function renderBody() {
    tbody.innerHTML = '';
    var start = (currentPage - 1) * PAGE_SIZE;
    var end = Math.min(start + PAGE_SIZE, filteredRows.length);

    if (filteredRows.length === 0) {
      emptyMsg.hidden = false;
      return;
    }

    emptyMsg.hidden = true;

    for (var i = start; i < end; i++) {
      var row = filteredRows[i];
      var tr = document.createElement('tr');
      var globalIdx = i;  // filteredRows内のインデックス
      columns.forEach(function (col) {
        var td = document.createElement('td');
        if (col.editable) {
          td.className = 'tbl-cell-editable';
          td.setAttribute('title', 'クリックして編集');
          td.setAttribute('data-idx', globalIdx);
          td.setAttribute('data-col', col.key);
        } else {
          td.className = 'tbl-cell-readonly';
        }
        renderCell(td, row, col);
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    }
  }

  // ── セル内容描画（編集モード除く） ──
  function renderCell(td, row, col) {
    td.textContent = '';
    var val = row[col.key];
    if (col.key === 'status') {
      var span = document.createElement('span');
      span.className = 'tbl-status';
      span.setAttribute('data-status', val != null ? val : '');
      span.textContent = val != null ? val : '';
      td.appendChild(span);
    } else {
      td.textContent = val != null ? val : '';
    }

    // コメントがあるセルは CSS の :has() で検知できるよう invisible indicator を挿入
    var commentKey = (row.id != null ? row.id : '') + '-' + col.key;
    if (comments[commentKey]) {
      var indicator = document.createElement('span');
      indicator.className = 'tbl-comment-indicator';
      td.appendChild(indicator);
    }
  }

  // ── ページネーションボタン描画 ──
  function renderPagination() {
    pagBtns.innerHTML = '';
    var totalPages = Math.ceil(filteredRows.length / PAGE_SIZE);
    if (totalPages <= 1) { return; }  // ボタン不要

    var prevBtn = document.createElement('button');
    prevBtn.className = 'pag-btn';
    prevBtn.textContent = '◀';  // ◀
    prevBtn.disabled = currentPage <= 1;
    prevBtn.addEventListener('click', function () {
      if (currentPage > 1) { currentPage--; render(); }
    });
    pagBtns.appendChild(prevBtn);

    // ページ番号ボタン（最大7個表示、端っこは省略記号）
    var pages = getPageNumbers(currentPage, totalPages);
    pages.forEach(function (p) {
      if (p === '...') {
        var span = document.createElement('span');
        span.className = 'pag-btn';
        span.setAttribute('disabled', '');
        span.setAttribute('aria-hidden', 'true');
        span.textContent = '…';  // …
        pagBtns.appendChild(span);
      } else {
        var btn = document.createElement('button');
        btn.className = 'pag-btn';
        btn.textContent = p;
        btn.setAttribute('data-page', p);
        if (p === currentPage) { btn.setAttribute('aria-current', 'page'); }
        btn.addEventListener('click', function () {
          currentPage = parseInt(this.getAttribute('data-page'), 10);
          render();
        });
        pagBtns.appendChild(btn);
      }
    });

    // 次へボタン
    var nextBtn = document.createElement('button');
    nextBtn.className = 'pag-btn';
    nextBtn.textContent = '▶';  // ▶
    nextBtn.disabled = currentPage >= totalPages;
    nextBtn.addEventListener('click', function () {
      if (currentPage < totalPages) { currentPage++; render(); }
    });
    pagBtns.appendChild(nextBtn);
  }

  // 表示すべきページ番号を配列で返す（端っこ省略処理）
  function getPageNumbers(current, total) {
    if (total <= 7) {
      var arr = [];
      for (var i = 1; i <= total; i++) { arr.push(i); }
      return arr;
    }

    var pages = [];
    if (current <= 4) {
      for (var i = 1; i <= 5; i++) { pages.push(i); }
      pages.push('...');
      pages.push(total);
    } else if (current >= total - 2) {
      pages.push(1);
      pages.push('...');
      for (var i = total - 4; i <= total; i++) { pages.push(i); }
    } else {
      pages.push(1);
      pages.push('...');
      for (var i = current - 1; i <= current + 1; i++) { pages.push(i); }
      pages.push('...');
      pages.push(total);
    }
    return pages;
  }

  // ── ページ情報表示 ──
  function renderInfo() {
    var total = filteredRows.length;
    var totalPages = Math.ceil(total / PAGE_SIZE);
    var start = (currentPage - 1) * PAGE_SIZE + 1;
    var end = Math.min(start + PAGE_SIZE - 1, total);
    var text = '全' + total + '件中 ' + start + '〜' + end + '件表示';
    if (totalPages > 1) { text += ' （' + totalPages + 'ページ）'; }
    pagInfo.textContent = text;
  }

  // ── 列定義（JSONから取得するが、renderBody内で参照するため関数外に出す） ──
  var columns = [];

  // ── ツールチップの表示 ──
  function showCommentTooltip(td, rowId, colKey) {
    // 既存のツールチップを閉じる（切り替え表示）
    hideCommentTooltip();

    var commentKey = rowId + '-' + colKey;
    var commentText = comments[commentKey] || '';

    // ツールチップ要素を作成
    var tip = document.createElement('div');
    tip.className = 'tbl-comment-tooltip';
    tip.setAttribute('data-row-id', rowId);
    tip.setAttribute('data-col-key', colKey);

    // コメント表示エリア
    var commentBody = document.createElement('div');
    commentBody.className = 'tbl-comment-body';
    if (commentText) {
      commentBody.textContent = commentText;
    } else {
      commentBody.className += ' tbl-comment-empty';
      commentBody.textContent = 'コメントはありません（右クリックで追加）';
    }

    // 閉じるボタン
    var closeBtn = document.createElement('button');
    closeBtn.className = 'tbl-comment-close';
    closeBtn.textContent = '✕';
    closeBtn.title = '閉じる';
    closeBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      hideCommentTooltip();
    });

    tip.appendChild(commentBody);
    tip.appendChild(closeBtn);
    document.body.appendChild(tip);

    // ポジショニング（セルの右下に表示）
    var tdRect = td.getBoundingClientRect();
    var tipRect = tip.getBoundingClientRect();
    var top = tdRect.bottom + window.scrollY + 4;
    var left = Math.min(tdRect.left + window.scrollX, document.documentElement.clientWidth - tipRect.width - 8);
    tip.style.top = top + 'px';
    tip.style.left = left + 'px';

    activeTooltip = { rowId: rowId, colKey: colKey, el: tip };
  }

  // ── ツールチップの非表示 ──
  function hideCommentTooltip() {
    if (activeTooltip.el) {
      document.body.removeChild(activeTooltip.el);
      activeTooltip.el = null;
    }
    activeTooltip.rowId = null;
    activeTooltip.colKey = null;
  }

  // ── 右クリックでコメント追加ダイアログ ──
  function showCommentInput(rowId, colKey, td) {
    hideCommentTooltip();

    var commentKey = rowId + '-' + colKey;
    var currentText = comments[commentKey] || '';

    // ダイアログ要素を作成
    var dialog = document.createElement('div');
    dialog.className = 'tbl-comment-dialog';

    var label = document.createElement('label');
    label.textContent = 'コメントを入力:';

    var textarea = document.createElement('textarea');
    textarea.className = 'tbl-comment-textarea';
    textarea.value = currentText;
    textarea.placeholder = 'コメントを入力...';

    var btnOk = document.createElement('button');
    btnOk.className = 'tbl-comment-btn tbl-comment-btn-ok';
    btnOk.textContent = '保存';

    var btnCancel = document.createElement('button');
    btnCancel.className = 'tbl-comment-btn tbl-comment-btn-cancel';
    btnCancel.textContent = 'キャンセル';

    dialog.appendChild(label);
    dialog.appendChild(textarea);
    dialog.appendChild(btnOk);
    dialog.appendChild(btnCancel);

    // ポジショニング（セルの下に配置）
    var tdRect = td.getBoundingClientRect();
    dialog.style.position = 'fixed';
    dialog.style.top = (tdRect.bottom + window.scrollY + 4) + 'px';
    dialog.style.left = Math.min(tdRect.left + window.scrollX, document.documentElement.clientWidth - 300) + 'px';
    dialog.style.zIndex = '1000';

    document.body.appendChild(dialog);
    textarea.focus();
    textarea.select();

    function removeDialog() {
      if (dialog.parentNode) {
        document.body.removeChild(dialog);
      }
    }

    btnOk.addEventListener('click', function () {
      var newText = textarea.value;
      if (newText) {
        comments[commentKey] = newText;
      } else {
        delete comments[commentKey];
      }
      saveComments();
      removeDialog();

      // コメント有無に応じてセルのindicatorを更新（即時反映）
      var existingIndicator = td.querySelector('.tbl-comment-indicator');
      if (comments[commentKey] && !existingIndicator) {
        var indicator = document.createElement('span');
        indicator.className = 'tbl-comment-indicator';
        td.appendChild(indicator);
      } else if (!comments[commentKey] && existingIndicator) {
        td.removeChild(existingIndicator);
      }

      // ツールチップを再表示
      showCommentTooltip(td, rowId, colKey);
    });

    btnCancel.addEventListener('click', function () {
      removeDialog();
    });

    textarea.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && e.ctrlKey) {
        btnOk.click();
      } else if (e.key === 'Escape') {
        removeDialog();
      }
    });

    // ダイアログ外クリックで閉じる
    setTimeout(function () {
      document.addEventListener('click', function handler(e) {
        if (!dialog.contains(e.target)) {
          removeDialog();
          document.removeEventListener('click', handler);
        }
      });
    }, 0);
  }

  // ── イベント委任: テーブルのセル操作 ──
  function bindEvents() {
    var wrap = document.getElementById('js-wrap');

    // グローバル検索テキストボックス — input イベントでリアルタイム絞り込み
    if (searchInput) {
      searchInput.addEventListener('input', function () {
        globalSearch = this.value;
        currentPage = 1;
        applyFilters();
        render();
      });
    }

    // ページ件数ドロップ — 変更でPAGE_SIZEを更新
    if (pageSizeSelect) {
      pageSizeSelect.addEventListener('change', function () {
        PAGE_SIZE = parseInt(this.value, 10);
        currentPage = 1;
        render();
      });
    }

    // ヘッダソート
    theadRow.addEventListener('click', function (e) {
      var th = e.target.closest('th[data-sortable]');
      if (!th) { return; }

      var colKey = th.getAttribute('data-col-key');
      if (!colKey) { return; }

      // 同じカラム: 昇順(1) → 降順(2) → なし(0) のサイクル
      // 別カラム: 昇順(1) から再開
      if (sortCol === colKey) {
        sortDir = sortDir === 1 ? 2 : sortDir === 2 ? 0 : 1;
        if (sortDir === 0) { sortCol = null; }
      } else {
        sortCol = colKey;
        sortDir = 1;
      }

      currentPage = 1;  // ソート時は1ページ目にリセット
      render();
    });

    // JSONエクスポートボタン
    var exportBtn = document.getElementById('js-export-btn');
    if (exportBtn) {
      exportBtn.addEventListener('click', function () {
        exportJSON();
      });
    }

    // コメントエクスポートボタン
    var exportCommentsBtn = document.getElementById('js-export-comments-btn');
    if (exportCommentsBtn) {
      exportCommentsBtn.addEventListener('click', function () {
        exportComments();
      });
    }

    // コメントインポートボタン
    var importCommentsBtn = document.getElementById('js-import-comments-btn');
    if (importCommentsBtn) {
      importCommentsBtn.addEventListener('click', function () {
        importComments();
      });
    }

    // セルクリック → インライン編集
    wrap.addEventListener('click', function (e) {
      var td = e.target.closest('td.tbl-cell-editable');
      if (!td || td.classList.contains('is-editing')) { return; }

      var idx = parseInt(td.getAttribute('data-idx'), 10);
      var colKey = td.getAttribute('data-col');
      var col = null;
      for (var i = 0; i < columns.length; i++) {
        if (columns[i].key === colKey) { col = columns[i]; break; }
      }
      if (!col) { return; }

      startEdit(td, filteredRows[idx], col);
    });

    // セル右クリック → コメント入力ダイアログ
    wrap.addEventListener('contextmenu', function (e) {
      var td = e.target.closest('td');
      if (!td) { return; }

      // 編集中のセルは無効化
      if (td.classList.contains('is-editing')) { return; }

      var colKey = td.getAttribute('data-col');
      var idxAttr = td.getAttribute('data-idx');
      if (!colKey || idxAttr === null) { return; }

      var rowIdx = parseInt(idxAttr, 10);
      if (isNaN(rowIdx) || rowIdx < 0 || rowIdx >= filteredRows.length) { return; }

      var row = filteredRows[rowIdx];
      var rowId = row.id;

      e.preventDefault();  // デフォルトの右クリックメニューを抑制
      showCommentInput(rowId, colKey, td);
    });

    // セルマウスオーバー → コメントツールチップ表示
    wrap.addEventListener('mouseover', function (e) {
      var td = e.target.closest('td.tbl-cell-editable');
      if (!td || td.classList.contains('is-editing')) { return; }

      var colKey = td.getAttribute('data-col');
      var idxAttr = td.getAttribute('data-idx');
      if (!colKey || idxAttr === null) { return; }

      var rowIdx = parseInt(idxAttr, 10);
      if (isNaN(rowIdx) || rowIdx < 0 || rowIdx >= filteredRows.length) { return; }

      var row = filteredRows[rowIdx];
      var rowId = row.id;

      // コメントがある場合のみツールチップを表示
      var commentKey = rowId + '-' + colKey;
      if (comments[commentKey]) {
        showCommentTooltip(td, rowId, colKey);
      }
    });

    // セルマウスアウト → ツールチップは閉じない（✕ボタンでのみ閉じる）
    // FEATURE.md: マウスがセルを離れても表示したまま
  }

  // ── インライン編集開始 ──
  function startEdit(td, row, col) {
    if (td.classList.contains('is-editing')) { return; }
    td.classList.add('is-editing');
    td.textContent = '';

    var savedVal = String(row[col.key] != null ? row[col.key] : '');
    var input;

    if (col.type === 'select') {
      input = document.createElement('select');
      input.className = 'tbl-select';
      STATUS_OPTS.forEach(function (opt) {
        var option = document.createElement('option');
        option.value = opt;
        option.textContent = opt;
        if (opt === savedVal) { option.selected = true; }
        input.appendChild(option);
      });
    } else {
      input = document.createElement('input');
      input.type = 'text';
      input.className = 'tbl-input';
      input.value = savedVal;
    }

    td.appendChild(input);
    input.focus();
    if (input.tagName === 'INPUT') { input.select(); }

    var committed = false;

    function confirmEdit() {
      if (committed) { return; }
      committed = true;
      row[col.key] = input.value;
      saveData();  // 編集後にlocalStorageへ自動保存
      td.classList.remove('is-editing');
      renderCell(td, row, col);
    }

    function cancelEdit() {
      if (committed) { return; }
      committed = true;
      td.classList.remove('is-editing');
      renderCell(td, row, col);
    }

    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        confirmEdit();
      } else if (e.key === 'Escape') {
        cancelEdit();
      }
    });

    // フォーカスが外れたら確定
    input.addEventListener('blur', confirmEdit);
  }

  // ── 初期化実行 ──
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      init();
      bindEvents();
    });
  } else {
    init();
    bindEvents();
  }

})();
