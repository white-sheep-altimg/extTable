// src/comment-manager.js
(function () {
  'use strict';

  const STORAGE_KEY = 'extTable_comments';
  let _comments = {}; // key: data-comment-id, value: { id: string, comment: string }
  let _initialized = false;
  let _rootElement = null; // コメント対象のルートDOM要素

  // ユニークなIDを生成
  function generateUniqueId() {
    return 'comment-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
  }

  // コメントをローカルストレージからロード
  function loadCommentsFromLocalStorage() {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (data) {
        _comments = JSON.parse(data);
      }
    } catch (e) {
      console.warn('コメントの読み込みに失敗しました:', e);
      _comments = {};
    }
  }

  // コメントをローカルストレージに保存
  function saveCommentsToLocalStorage() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(_comments));
    } catch (e) {
      console.warn('コメントの保存に失敗しました:', e);
    }
  }

  // ツールチップ関連の変数
  let _tooltipElement = null;
  let _tooltipTimeout = null;
  let _activeCommentElement = null; // 現在ツールチップが表示されている要素

  // コメントモーダル関連の変数
  let _commentModal = null;
  let _commentTextarea = null;
  let _commentModalResolve = null; // Promiseを解決するための関数

  // コメントモーダルを作成または取得する
  function _createCommentModal() {
    if (_commentModal) {
      return _commentModal;
    }

    _commentModal = document.createElement('div');
    _commentModal.id = 'comment-modal-overlay';
    _commentModal.innerHTML = `
      <div id="comment-modal-content">
        <h3>コメント</h3>
        <textarea id="comment-textarea" rows="5"></textarea>
        <div class="comment-modal-actions">
          <button id="comment-save-btn">保存</button>
          <button id="comment-cancel-btn">キャンセル</button>
        </div>
      </div>
    `;
    document.body.appendChild(_commentModal);

    _commentTextarea = document.getElementById('comment-textarea');
    document.getElementById('comment-save-btn').addEventListener('click', () => {
      if (_commentModalResolve) {
        _commentModalResolve(_commentTextarea.value);
      }
      _hideCommentModal();
    });
    document.getElementById('comment-cancel-btn').addEventListener('click', () => {
      if (_commentModalResolve) {
        _commentModalResolve(null); // キャンセルの場合はnullを返す
      }
      _hideCommentModal();
    });
    _commentModal.addEventListener('click', (e) => {
      if (e.target.id === 'comment-modal-overlay') { // オーバーレイのクリックで閉じる
        if (_commentModalResolve) {
          _commentModalResolve(null);
        }
        _hideCommentModal();
      }
    });

    return _commentModal;
  }

  // コメントモーダルを表示する
  function _showCommentModal(initialComment) {
    _createCommentModal(); // モーダルがなければ作成
    _commentTextarea.value = initialComment || '';
    _commentModal.style.display = 'flex'; // flexで表示
    _commentTextarea.focus();

    return new Promise((resolve) => {
      _commentModalResolve = resolve;
    });
  }

  // コメントモーダルを非表示にする
  function _hideCommentModal() {
    if (_commentModal) {
      _commentModal.style.display = 'none';
    }
    _commentModalResolve = null; // resolve関数をリセット
  }


  // ツールチップを表示する
  function showTooltip(element, commentId) {
    if (_tooltipTimeout) {
      clearTimeout(_tooltipTimeout);
    }
    if (_tooltipElement && _activeCommentElement === element) {
      // 既に表示されていて、対象要素が変わっていなければ何もしない
      return;
    }
    hideTooltip(); // 他のツールチップがあれば非表示にする

    const commentText = CommentManager.getComment(commentId);
    if (!commentText) {
      return;
    }

    _tooltipElement = document.createElement('div');
    _tooltipElement.className = 'comment-tooltip';
    _tooltipElement.innerHTML = `
      <div class="comment-tooltip-content">${commentText}</div>
      <div class="comment-tooltip-edit">
        <button data-action="edit-comment">編集</button>
        <button data-action="delete-comment">削除</button>
      </div>
    `;
    document.body.appendChild(_tooltipElement);

    // 要素の位置に基づいてツールチップを配置
    const rect = element.getBoundingClientRect();
    _tooltipElement.style.left = `${rect.left + window.scrollX}px`;
    _tooltipElement.style.top = `${rect.bottom + window.scrollY + 5}px`;

    // 編集ボタンと削除ボタンのイベントリスナー
    _tooltipElement.querySelector('[data-action="edit-comment"]').addEventListener('click', async (e) => {
      e.stopPropagation(); // クリックイベントが親要素に伝播しないようにする
      hideTooltip();
      await showCommentEditor(element, commentId);
    });
    _tooltipElement.querySelector('[data-action="delete-comment"]').addEventListener('click', (e) => {
      e.stopPropagation();
      if (confirm('このコメントを削除しますか？')) {
        CommentManager.deleteComment(commentId);
        element.removeAttribute('data-has-comment'); // コメントがないことを示す属性を削除
        hideTooltip();
      }
    });

    // ツールチップがマウスアウトされたら非表示にする（少し遅延させる）
    _tooltipElement.addEventListener('mouseleave', () => {
      _tooltipTimeout = setTimeout(hideTooltip, 300); // 300ms後に非表示
    });
    _tooltipElement.addEventListener('mouseenter', () => {
      clearTimeout(_tooltipTimeout); // ツールチップ上にマウスが戻ったら非表示タイマーをクリア
    });

    _activeCommentElement = element;
  }

  // ツールチップを非表示にする
  function hideTooltip() {
    if (_tooltipTimeout) {
      clearTimeout(_tooltipTimeout);
    }
    if (_tooltipElement) {
      _tooltipElement.remove();
      _tooltipElement = null;
      _activeCommentElement = null;
    }
  }

  // コメント編集UIを表示する関数 (カスタムモーダル版)
  async function showCommentEditor(element, commentId) {
    const existingComment = CommentManager.getComment(commentId) || '';

    // モーダルを表示し、Promiseの結果を待つ
    const newComment = await _showCommentModal(existingComment);

    if (newComment !== null) { // キャンセルされなかった場合
      if (newComment.trim() === '') {
        CommentManager.deleteComment(commentId); // 空の場合は削除
      } else {
        CommentManager.addOrUpdateComment(commentId, newComment);
      }
      // コメントの更新を視覚的にフィードバックするために、ツールチップの表示を更新する
      hideTooltip(); // 古いツールチップがあれば非表示にする
      // コメントが存在する場合のみ、新しいツールチップを表示
      if (CommentManager.getComment(commentId)) {
        showTooltip(element, commentId);
      }
    }
  }


  // 右クリック時のイベントハンドラ
  function handleContextMenu(e) {
    // _rootElement の子孫要素で右クリックされた場合のみ処理
    if (!_rootElement.contains(e.target)) {
        return;
    }

    e.preventDefault(); // デフォルトの右クリックメニューを抑制

    let targetElement = e.target;
    // data-comment-enabled="true" が設定されている要素、
    // あるいはそれが指定されていない場合はルート要素の子孫全てを対象とする
    if (_rootElement.querySelector('[data-comment-enabled="true"]')) {
      targetElement = e.target.closest('[data-comment-enabled="true"]');
      if (!targetElement || !_rootElement.contains(targetElement)) {
        return; // コメント有効な要素が見つからないか、ルート外なら処理しない
      }
    }


    let commentId = targetElement.dataset.commentId;

    // data-comment-id がない場合は生成して付与
    if (!commentId) {
      commentId = generateUniqueId();
      targetElement.dataset.commentId = commentId;
      console.log('新しくdata-comment-idを付与しました:', commentId, targetElement);
    }

    // コメント追加/編集UIを表示
    showCommentEditor(targetElement, commentId);
  }

  // マウスオーバーイベントハンドラ
  function handleMouseOver(e) {
    // _rootElement の子孫要素でマウスオーバーされた場合のみ処理
    if (!_rootElement.contains(e.target)) {
        return;
    }
    const targetElement = e.target.closest('[data-comment-id]');
    if (targetElement) {
      const commentId = targetElement.dataset.commentId;
      if (CommentManager.getComment(commentId)) {
        // 遅延させてツールチップを表示
        _tooltipTimeout = setTimeout(() => showTooltip(targetElement, commentId), 300);
      }
    }
  }

  // マウスアウトイベントハンドラ
  function handleMouseOut(e) {
    // _rootElement の子孫要素でマウスアウトされた場合のみ処理
    if (!_rootElement.contains(e.target)) {
        return;
    }
    // 遅延させてツールチップを非表示
    _tooltipTimeout = setTimeout(hideTooltip, 300);
  }


  const CommentManager = {
    /**
     * コメントマネージャーを初期化します。
     * @param {HTMLElement} rootElement コメント機能の対象となるルートDOM要素。
     */
    init: function (rootElement) {
      if (_initialized) {
        console.warn('CommentManager は既に初期化されています。');
        return;
      }
      _rootElement = rootElement;
      loadCommentsFromLocalStorage(); // 既存のコメントをロード

      // コメント可能な要素にマーカーを付与 (初期ロード時)
      Object.keys(_comments).forEach(commentId => {
        const el = _rootElement.querySelector(`[data-comment-id="${commentId}"]`);
        if (el) {
          el.setAttribute('data-has-comment', 'true');
        }
      });

      _rootElement.addEventListener('contextmenu', handleContextMenu);
      _rootElement.addEventListener('mouseover', handleMouseOver);
      _rootElement.addEventListener('mouseout', handleMouseOut);

      _initialized = true;
      console.log('CommentManager が初期化されました。');
    },

    /**
     * 指定されたIDの要素にコメントを追加または更新します。
     * @param {string} elementId コメントを付与する要素のID (data-comment-id)。
     * @param {string} comment 追加または更新するコメントテキスト。
     */
    addOrUpdateComment: function (elementId, comment) {
      if (!_initialized) {
        console.error('CommentManager が初期化されていません。');
        return;
      }
      _comments[elementId] = { id: elementId, comment: comment };
      saveCommentsToLocalStorage();
      // コメントが付与された要素に `data-has-comment` 属性を追加
      const targetElement = _rootElement.querySelector(`[data-comment-id="${elementId}"]`);
      if (targetElement) {
        targetElement.setAttribute('data-has-comment', 'true');
      }
    },

    /**
     * 指定されたIDの要素のコメントを取得します。
     * @param {string} elementId コメントを取得する要素のID (data-comment-id)。
     * @returns {string|undefined} コメントテキスト、またはコメントが存在しない場合は undefined。
     */
    getComment: function (elementId) {
      if (!_initialized) {
        console.error('CommentManager が初期化されていません。');
        return undefined;
      }
      return _comments[elementId] ? _comments[elementId].comment : undefined;
    },

    /**
     * 指定されたIDの要素のコメントを削除します。
     * @param {string} elementId コメントを削除する要素のID (data-comment-id)。
     */
    deleteComment: function (elementId) {
      if (!_initialized) {
        console.error('CommentManager が初期化されていません。');
        return;
      }
      delete _comments[elementId];
      saveCommentsToLocalStorage();
      // コメントが削除された要素から `data-has-comment` 属性を削除
      const targetElement = _rootElement.querySelector(`[data-comment-id="${elementId}"]`);
      if (targetElement) {
        targetElement.removeAttribute('data-has-comment');
      }
    },

    /**
     * 全てのコメントをJSON形式で返します。
     * @returns {string} 全てのコメントデータのJSON文字列。
     */
    getCommentsAsJSON: function () {
      if (!_initialized) {
        console.error('CommentManager が初期化されていません。');
        return '{}';
      }
      return JSON.stringify(_comments, null, 2);
    },

    /**
     * JSON形式のコメントデータを読み込みます。
     * 既存のコメントは上書きされます。
     * @param {string} jsonString JSON形式のコメントデータ文字列。
     */
    loadCommentsFromJSON: function (jsonString) {
      if (!_initialized) {
        console.error('CommentManager が初期化されていません。');
        return;
      }
      try {
        const newComments = JSON.parse(jsonString);
        _comments = newComments;
        saveCommentsToLocalStorage();
        console.log('コメントデータがJSONから読み込まれました。');

        // コメントの有無を示す属性を更新 (UIの再描画に必要)
        // まず、全ての既存の data-has-comment 属性を削除
        _rootElement.querySelectorAll('[data-has-comment="true"]').forEach(el => {
          el.removeAttribute('data-has-comment');
        });
        // 新しいコメントに基づいて data-has-comment 属性を設定
        Object.keys(_comments).forEach(commentId => {
          const el = _rootElement.querySelector(`[data-comment-id="${commentId}"]`);
          if (el) {
            el.setAttribute('data-has-comment', 'true');
          }
        });
      } catch (e) {
        console.error('コメントJSONデータの読み込みに失敗しました:', e);
      }
    },

    /**
     * ルート要素を取得します。
     * @returns {HTMLElement|null} ルート要素。
     */
    getRootElement: function () {
      return _rootElement;
    },

    /**
     * ユニークなIDを公開。DOMに付与する際に使用。
     */
    generateUniqueId: generateUniqueId
  };

  // グローバルスコープに公開
  window.CommentManager = CommentManager;
})();
