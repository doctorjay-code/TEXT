// ==========================================================================
// 문학적 감성 TXT eBook 리더기 - 메인 어플리케이션 스크립트 (최종 통합본)
// ==========================================================================

// --- IndexedDB 다중 도서 보존 헬퍼 ---
const DB_NAME = 'TXTReaderDB';
const STORE_NAME = 'books';

function initDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = (e) => resolve(e.target.result);
    request.onerror = (e) => reject(e.target.error);
  });
}

// 여러 권 보관을 위해 책 제목(title)을 id로 저장 (폴더 핸들이 있을 경우 dirHandle 추가 보존)
function saveBook(title, chapters, dirHandle = null) {
  return initDB().then(db => {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const data = { id: title, title, chapters, dirHandle };
      const request = store.put(data);
      request.onsuccess = () => resolve();
      request.onerror = (e) => reject(e.target.error);
    });
  });
}

function loadBook(title) {
  return initDB().then(db => {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(title);
      request.onsuccess = (e) => resolve(e.target.result);
      request.onerror = (e) => reject(e.target.error);
    });
  });
}

function loadAllBooks() {
  return initDB().then(db => {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();
      request.onsuccess = (e) => resolve(e.target.result);
      request.onerror = (e) => reject(e.target.error);
    });
  });
}

function deleteBook(title) {
  return initDB().then(db => {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(title);
      request.onsuccess = () => resolve();
      request.onerror = (e) => reject(e.target.error);
    });
  });
}


document.addEventListener('DOMContentLoaded', () => {
  // --- 상태 관리 변수 ---
  let currentFileName = '';
  let chapters = [];
  let currentChapterIndex = 0;
  let currentSize = 16;
  let scrollSaveTimeout = null;
  
  // --- DOM 요소 선택 ---
  const body = document.body;
  const uploadContainer = document.getElementById('upload-container');
  const viewerContainer = document.getElementById('viewer-container');
  
  const fileInput = document.getElementById('file-input');
  const folderInput = document.getElementById('folder-input');
  const btnSyncFolder = document.getElementById('btn-sync-folder');
  const uploadBox = document.querySelector('.upload-box');
  
  const sizeVal = document.getElementById('size-val');
  const readingContent = document.getElementById('reading-content');
  const chapterTitleEl = document.getElementById('chapter-title');
  
  const tocList = document.getElementById('toc-list');
  const tocSidebar = document.getElementById('toc-sidebar');
  
  const libraryList = document.getElementById('library-list');
  const librarySidebar = document.getElementById('library-sidebar');
  
  const progressBar = document.querySelector('.progress-fill');
  const btnBookmark = document.getElementById('btn-bookmark-top');

  // ==========================================================================
  // [3단계] 독서 편의성 설정 복원 및 제어 (localStorage 동기화)
  // ==========================================================================

  const restoreSettings = () => {
    const savedSize = localStorage.getItem('reader_font_size');
    if (savedSize) {
      currentSize = parseInt(savedSize, 10);
      updateFontSize(currentSize);
    } else {
      updateFontSize(16);
    }

    const savedFont = localStorage.getItem('reader_font_family') || 'font-serif';
    const selectFont = document.getElementById('select-font-family');
    
    body.classList.remove('font-serif', 'font-sans', 'font-ridi', 'font-maru', 'font-kopub', 'font-pretendard', 'font-nanumgothic');
    body.classList.add(savedFont);
    if (selectFont) {
      selectFont.value = savedFont;
    }

    const savedTheme = localStorage.getItem('reader_theme') || 'theme-cream';
    body.classList.remove('theme-cream', 'theme-white', 'theme-dark', 'theme-sepia', 'theme-green', 'theme-custom');
    body.classList.add(savedTheme);
    
    document.querySelectorAll('.btn-theme').forEach(btn => btn.classList.remove('active'));
    let themeBtnId = '';
    if (savedTheme === 'theme-cream') themeBtnId = 'btn-theme-cream';
    else if (savedTheme === 'theme-white') themeBtnId = 'btn-theme-white';
    else if (savedTheme === 'theme-dark') themeBtnId = 'btn-theme-dark';
    else if (savedTheme === 'theme-sepia') themeBtnId = 'btn-theme-sepia';
    else if (savedTheme === 'theme-green') themeBtnId = 'btn-theme-green';
    
    if (themeBtnId) {
      const activeBtn = document.getElementById(themeBtnId);
      if (activeBtn) activeBtn.classList.add('active');
    }

    // 커스텀 색상 테마 불러오기
    const customBg = localStorage.getItem('reader_custom_bg') || '#faf9f5';
    const customText = localStorage.getItem('reader_custom_text') || '#2d2d2d';
    const pickerBg = document.getElementById('picker-bg');
    const pickerText = document.getElementById('picker-text');
    if (pickerBg) pickerBg.value = customBg;
    if (pickerText) pickerText.value = customText;

    if (savedTheme === 'theme-custom') {
      applyCustomThemeColors(customBg, customText);
    } else {
      clearCustomThemeColors();
    }
  };

  const updateFontSize = (size) => {
    currentSize = size;
    sizeVal.textContent = `${currentSize}px`;
    readingContent.style.fontSize = `${currentSize}px`;
    localStorage.setItem('reader_font_size', size.toString());
  };

  document.getElementById('btn-size-dec').addEventListener('click', () => {
    if (currentSize > 12) updateFontSize(currentSize - 1);
  });

  document.getElementById('btn-size-inc').addEventListener('click', () => {
    if (currentSize < 30) updateFontSize(currentSize + 1);
  });

  document.getElementById('btn-size-reset').addEventListener('click', () => {
    updateFontSize(16);
  });

  const selectFont = document.getElementById('select-font-family');
  if (selectFont) {
    selectFont.addEventListener('change', (e) => {
      const selectedFont = e.target.value;
      body.classList.remove('font-serif', 'font-sans', 'font-ridi', 'font-maru', 'font-kopub', 'font-pretendard', 'font-nanumgothic');
      body.classList.add(selectedFont);
      localStorage.setItem('reader_font_family', selectedFont);
    });
  }

  // 커스텀 테마 제어 함수 정의
  const applyCustomThemeColors = (bgColor, textColor) => {
    body.style.setProperty('--color-bg', bgColor);
    body.style.setProperty('--color-text', textColor);
    body.style.setProperty('--color-card-bg', bgColor);
    
    // 어두운 테마 밝은 테마 판단에 따른 카드 보더와 텍스트 색감 조율
    const isDarkBg = isColorDark(bgColor);
    if (isDarkBg) {
      body.style.setProperty('--color-border', 'rgba(255, 255, 255, 0.08)');
      body.style.setProperty('--color-border-hover', 'rgba(255, 255, 255, 0.15)');
      body.style.setProperty('--color-text-muted', 'rgba(255, 255, 255, 0.6)');
    } else {
      body.style.setProperty('--color-border', 'rgba(0, 0, 0, 0.08)');
      body.style.setProperty('--color-border-hover', 'rgba(0, 0, 0, 0.15)');
      body.style.setProperty('--color-text-muted', 'rgba(0, 0, 0, 0.6)');
    }
  };

  const clearCustomThemeColors = () => {
    body.style.removeProperty('--color-bg');
    body.style.removeProperty('--color-text');
    body.style.removeProperty('--color-card-bg');
    body.style.removeProperty('--color-border');
    body.style.removeProperty('--color-border-hover');
    body.style.removeProperty('--color-text-muted');
  };

  const isColorDark = (hexColor) => {
    let c = hexColor.substring(1);
    let rgb = parseInt(c, 16);
    let r = (rgb >> 16) & 0xff;
    let g = (rgb >> 8) & 0xff;
    let b = (rgb >> 0) & 0xff;
    let luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    return luma < 120; // 밝기 기준점
  };

  const themeButtons = {
    'btn-theme-cream': 'theme-cream',
    'btn-theme-white': 'theme-white',
    'btn-theme-dark': 'theme-dark',
    'btn-theme-sepia': 'theme-sepia',
    'btn-theme-green': 'theme-green'
  };

  Object.entries(themeButtons).forEach(([btnId, themeClass]) => {
    const btn = document.getElementById(btnId);
    if (btn) {
      btn.addEventListener('click', (e) => {
        body.classList.remove('theme-cream', 'theme-white', 'theme-dark', 'theme-sepia', 'theme-green', 'theme-custom');
        body.classList.add(themeClass);
        clearCustomThemeColors();
        
        document.querySelectorAll('.btn-theme').forEach(b => b.classList.remove('active'));
        e.currentTarget.classList.add('active');
        localStorage.setItem('reader_theme', themeClass);
      });
    }
  });

  const pickerBg = document.getElementById('picker-bg');
  const pickerText = document.getElementById('picker-text');

  const handleCustomColorChange = () => {
    const bgColor = pickerBg.value;
    const textColor = pickerText.value;
    
    body.classList.remove('theme-cream', 'theme-white', 'theme-dark', 'theme-sepia', 'theme-green');
    body.classList.add('theme-custom');
    
    document.querySelectorAll('.btn-theme').forEach(b => b.classList.remove('active'));
    applyCustomThemeColors(bgColor, textColor);
    
    localStorage.setItem('reader_theme', 'theme-custom');
    localStorage.setItem('reader_custom_bg', bgColor);
    localStorage.setItem('reader_custom_text', textColor);
  };

  if (pickerBg && pickerText) {
    pickerBg.addEventListener('input', handleCustomColorChange);
    pickerText.addEventListener('input', handleCustomColorChange);
  }

  // 목차(TOC) 사이드바 제어
  // 목차(TOC) 사이드바 제어 및 검색 초기화
  const tocSearchInput = document.getElementById('toc-search-input');
  
  const openToc = () => {
    if (tocSearchInput) {
      tocSearchInput.value = '';
      renderChaptersTOC(''); // 전체 목차 복원
    }
    tocSidebar.classList.add('open');
  };
  const closeToc = () => tocSidebar.classList.remove('open');

  document.getElementById('btn-toc-top').addEventListener('click', openToc);
  document.getElementById('btn-toc-bottom').addEventListener('click', openToc);
  document.getElementById('btn-toc-close').addEventListener('click', closeToc);
  document.getElementById('toc-backdrop').addEventListener('click', closeToc);

  // 실시간 화 검색 입력 동기화
  if (tocSearchInput) {
    tocSearchInput.addEventListener('input', (e) => {
      const query = e.target.value.toLowerCase().trim();
      renderChaptersTOC(query);
    });
  }

  // 책장(Library) 사이드바 제어
  const openLibrary = () => {
    renderLibrary();
    librarySidebar.classList.add('open');
  };
  const closeLibrary = () => librarySidebar.classList.remove('open');

  document.getElementById('btn-library').addEventListener('click', openLibrary);
  document.getElementById('btn-library-close').addEventListener('click', closeLibrary);
  document.getElementById('library-backdrop').addEventListener('click', closeLibrary);


  // ==========================================================================
  // [4단계] 네비게이션 및 책갈피/오프라인 무-업로드 이어읽기 구현
  // ==========================================================================

  // 프로그램 시작 시 다중 도서 자동 로드 시도
  restoreSettings();
  
  const savedActiveBook = localStorage.getItem('reader_active_book_title');
  
  if (savedActiveBook) {
    switchToBook(savedActiveBook);
  } else {
    loadAllBooks().then(allBooks => {
      if (allBooks && allBooks.length > 0) {
        switchToBook(allBooks[0].title);
      } else {
        uploadContainer.classList.add('active');
        viewerContainer.classList.remove('active');
      }
    });
  }

  // File System Access API용 디렉토리 읽기 권한 검증 및 요청 함수
  async function verifyPermission(fileHandle, readWrite) {
    const options = {};
    if (readWrite) {
      options.mode = 'readwrite';
    }
    if ((await fileHandle.queryPermission(options)) === 'granted') {
      return true;
    }
    if ((await fileHandle.requestPermission(options)) === 'granted') {
      return true;
    }
    return false;
  }

  // 디렉토리 핸들에서 파일 수집하는 비동기 함수
  async function readFilesFromDirectoryHandle(dirHandle) {
    const files = [];
    for await (const entry of dirHandle.values()) {
      if (entry.kind === 'file' && entry.name.toLowerCase().endsWith('.txt')) {
        const file = await entry.getFile();
        files.push(file);
      }
    }
    return files;
  }

  // 특정 도서 불러오기 및 뷰어 세팅 전환 함수 (폴더 동기화 로직 내장)
  function switchToBook(bookTitle) {
    loadBook(bookTitle).then(async (book) => {
      if (book) {
        // 만약 저장된 책에 폴더 핸들(dirHandle)이 연동되어 있다면 실시간 스캔 동기화 시도
        if (book.dirHandle) {
          try {
            const hasPermission = await verifyPermission(book.dirHandle, false);
            if (hasPermission) {
              const files = await readFilesFromDirectoryHandle(book.dirHandle);
              if (files.length > 0) {
                const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
                files.sort((a, b) => collator.compare(a.name, b.name));
                
                const readPromises = files.map(file => {
                  return new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.readAsText(file, 'utf-8');
                    reader.onload = (e) => {
                      let text = e.target.result;
                      const replacementCharCount = (text.match(/\uFFFD/g) || []).length;
                      const koreanCharCount = (text.match(/[가-힣]/g) || []).length;
                      const cleanTitle = file.name.replace(/\.txt$/i, '');
                      
                      if (replacementCharCount > 5 || (koreanCharCount === 0 && text.length > 200)) {
                        const retryReader = new FileReader();
                        retryReader.readAsText(file, 'euc-kr');
                        retryReader.onload = (retryEvent) => {
                          resolve({ title: cleanTitle, content: retryEvent.target.result });
                        };
                      } else {
                        resolve({ title: cleanTitle, content: text });
                      }
                    };
                  });
                });
                
                const freshChapters = await Promise.all(readPromises);
                
                // 만약 폴더 내부의 챕터 구성이 바뀌었다면(예: 11화가 추가됨), DB를 최신으로 갱신
                if (freshChapters.length !== book.chapters.length || 
                    freshChapters[freshChapters.length - 1].title !== book.chapters[book.chapters.length - 1].title) {
                  await saveBook(bookTitle, freshChapters, book.dirHandle);
                  book.chapters = freshChapters;
                }
              }
            }
          } catch (dirErr) {
            console.warn('폴더 동기화 실패 (기존 캐시본으로 구동합니다):', dirErr);
          }
        }

        chapters = book.chapters;
        currentFileName = book.title;
        localStorage.setItem('reader_active_book_title', currentFileName);
        
        currentChapterIndex = parseInt(localStorage.getItem(`reader_current_chapter_${currentFileName}`) || '0', 10);
        if (currentChapterIndex >= chapters.length) currentChapterIndex = 0;
        
        uploadContainer.classList.remove('active');
        viewerContainer.classList.add('active');
        
        renderChaptersTOC();
        displayChapter(currentChapterIndex, true);
      } else {
        uploadContainer.classList.add('active');
        viewerContainer.classList.remove('active');
      }
    }).catch(err => {
      console.error('책 전환 로드 실패:', err);
      uploadContainer.classList.add('active');
    });
  }

  // 새 책 열기 (현재 책을 보존한 채 업로드 화면으로 단순 복귀)
  document.getElementById('btn-open-file').addEventListener('click', () => {
    uploadContainer.classList.add('active');
    viewerContainer.classList.remove('active');
  });

  // 책장(Library) 리스트 그리기 (내보내기 & 삭제 버튼 제공)
  function renderLibrary() {
    loadAllBooks().then(allBooks => {
      let html = '';
      if (allBooks.length === 0) {
        html = `<li style="padding: 2rem; text-align: center; color: var(--color-text-muted); font-size: 0.9rem;">책장이 비어 있습니다. 소설 파일을 추가해 보세요.</li>`;
      } else {
        allBooks.forEach(book => {
          const isActive = book.title === currentFileName ? 'active' : '';
          const isSynced = book.dirHandle ? ' 🔄' : '';
          html += `
            <li class="${isActive}" data-title="${book.title}">
              <a href="#" class="lib-book-link">${book.title}${isSynced}</a>
              <div class="lib-action-group">
                <button class="btn-export-book" title="백업 파일(.json)로 추출하기">📤</button>
                <button class="btn-delete-book" title="책장에서 삭제">🗑️</button>
              </div>
            </li>
          `;
        });
      }
      libraryList.innerHTML = html;
    });
  }

  // 책장 이벤트 위임 등록 (책 클릭 시 전환 / 📤 내보내기 / 🗑️ 삭제)
  libraryList.addEventListener('click', (e) => {
    e.preventDefault();
    const li = e.target.closest('li');
    if (!li) return;
    
    const bookTitle = li.dataset.title;
    
    if (e.target.classList.contains('btn-delete-book')) {
      if (confirm(`책장본 '[${bookTitle}]'을(를) 삭제하시겠습니까?\n(읽던 위치와 설정 데이터가 모두 지워집니다.)`)) {
        deleteBook(bookTitle).then(() => {
          localStorage.removeItem(`reader_current_chapter_${bookTitle}`);
          localStorage.removeItem(`reader_scroll_ratio_${bookTitle}`);
          
          const bookmarks = loadBookmarks();
          delete bookmarks[bookTitle];
          saveBookmarks(bookmarks);
          
          if (bookTitle === currentFileName) {
            loadAllBooks().then(remainingBooks => {
              if (remainingBooks.length > 0) {
                switchToBook(remainingBooks[0].title);
              } else {
                localStorage.removeItem('reader_active_book_title');
                currentFileName = '';
                chapters = [];
                currentChapterIndex = 0;
                uploadContainer.classList.add('active');
                viewerContainer.classList.remove('active');
              }
              renderLibrary();
            });
          } else {
            renderLibrary();
          }
        });
      }
    } else if (e.target.classList.contains('btn-export-book')) {
      // 책 백업 데이터 JSON 파일로 내보내기 (PC -> 폰 전송용)
      loadBook(bookTitle).then(book => {
        if (!book) return;
        
        const bookmarks = loadBookmarks();
        const bookBookmarks = bookmarks[bookTitle] || [];
        
        const readerSettings = {
          theme: localStorage.getItem('reader_theme') || 'theme-cream',
          fontFamily: localStorage.getItem('reader_font_family') || 'font-serif',
          fontSize: localStorage.getItem('reader_font_size') || '16',
          customBg: localStorage.getItem('reader_custom_bg') || '#faf9f5',
          customText: localStorage.getItem('reader_custom_text') || '#2d2d2d'
        };

        const cleanBook = {
          title: book.title,
          chapters: book.chapters,
          bookmarks: bookBookmarks,
          settings: readerSettings
        };
        
        const jsonStr = JSON.stringify(cleanBook);
        
        // 대용량 도서 대응 및 모바일 성능을 위한 청크 단위 Base64 인코딩
        const utf8Bytes = new TextEncoder().encode(jsonStr);
        let binary = '';
        const len = utf8Bytes.byteLength;
        const chunkSize = 16384;
        for (let i = 0; i < len; i += chunkSize) {
          const chunk = utf8Bytes.subarray(i, i + chunkSize);
          binary += String.fromCharCode.apply(null, chunk);
        }
        const base64Str = btoa(binary);
        
        // 사파리 마임 스니핑 방지 및 올바른 JSON 포맷 유지를 위해 객체 형태로 래핑
        const wrappedData = {
          type: 'encrypted_txt_reader_backup',
          data: base64Str
        };
        const wrappedJsonStr = JSON.stringify(wrappedData, null, 2);
        
        const blob = new Blob([wrappedJsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `${bookTitle}_backup.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        
        // 모바일 사파리에서 다운로드 처리가 끝나기 전에 URL이 파괴되어 생기는 오류 방지 (지연 실행)
        setTimeout(() => {
          URL.revokeObjectURL(url);
        }, 3000);
      });
    } else if (e.target.closest('.lib-book-link')) {
      switchToBook(bookTitle);
      closeLibrary();
    }
  });

  // 백업 파일 처리 공통 함수
  const handleImportJson = (file, inputElement) => {
    if (!file) return;

    const reader = new FileReader();
    reader.readAsText(file, 'utf-8');
    reader.onload = (event) => {
      try {
        const rawText = event.target.result.trim();
        let jsonStr = '';
        
        try {
          // 1. JSON 구조로 파싱 시도 (신규 래핑 포맷 혹은 예전 평문 백업)
          const parsed = JSON.parse(rawText);
          if (parsed && parsed.type === 'encrypted_txt_reader_backup' && parsed.data) {
            // 암호화된 래핑 백업 파일 해독
            const decodedBinary = atob(parsed.data);
            const len = decodedBinary.length;
            const bytes = new Uint8Array(len);
            for (let i = 0; i < len; i++) {
              bytes[i] = decodedBinary.charCodeAt(i);
            }
            jsonStr = new TextDecoder().decode(bytes);
          } else {
            // 이전 버전의 일반 평문 JSON 백업본
            jsonStr = rawText;
          }
        } catch (jsonErr) {
          // 2. JSON.parse 실패 시, 순수 Base64 파일 해독 시도 (직전 구현본 호환)
          try {
            const decodedBinary = atob(rawText);
            const len = decodedBinary.length;
            const bytes = new Uint8Array(len);
            for (let i = 0; i < len; i++) {
              bytes[i] = decodedBinary.charCodeAt(i);
            }
            jsonStr = new TextDecoder().decode(bytes);
          } catch (base64Err) {
            // 디코딩 실패 시 원래의 원본 텍스트 사용
            jsonStr = rawText;
          }
        }
        
        const bookData = JSON.parse(jsonStr);
        
        if (bookData && bookData.title && bookData.chapters && Array.isArray(bookData.chapters)) {
          saveBook(bookData.title, bookData.chapters).then(() => {
            // 북마크 정보 복원
            if (bookData.bookmarks && Array.isArray(bookData.bookmarks)) {
              const bookmarks = loadBookmarks();
              bookmarks[bookData.title] = bookData.bookmarks;
              saveBookmarks(bookmarks);
            }
            
            // 설정(테마, 글꼴, 글자크기, 커스텀 색상) 정보 복원
            if (bookData.settings) {
              const s = bookData.settings;
              if (s.theme) localStorage.setItem('reader_theme', s.theme);
              if (s.fontFamily) localStorage.setItem('reader_font_family', s.fontFamily);
              if (s.fontSize) localStorage.setItem('reader_font_size', s.fontSize);
              if (s.customBg) localStorage.setItem('reader_custom_bg', s.customBg);
              if (s.customText) localStorage.setItem('reader_custom_text', s.customText);
              
              // 화면 즉시 리프레시
              restoreSettings();
            }
            
            alert(`📥 [${bookData.title}] 책 백업본을 책장에 성공적으로 가져왔습니다!`);
            renderLibrary();
            switchToBook(bookData.title);
            closeLibrary();
            inputElement.value = '';
          });
        } else {
          alert('⚠️ 올바르지 않은 백업 파일 형식입니다.');
        }
      } catch (err) {
        console.error('백업 가져오기 실패:', err);
        alert('⚠️ 백업 파일(.json) 분석 도중 오류가 발생했습니다.');
      }
    };
  };

  // 백업 가져오기 (Import) 이벤트 연동
  const btnImportBook = document.getElementById('btn-import-book');
  const importFileInput = document.getElementById('import-file-input');

  btnImportBook.addEventListener('click', () => {
    importFileInput.click();
  });

  importFileInput.addEventListener('change', (e) => {
    handleImportJson(e.target.files[0], importFileInput);
  });

  // 메인 업로드 화면의 백업 가져오기 연동
  const importFileInputMain = document.getElementById('import-file-input-main');
  if (importFileInputMain) {
    importFileInputMain.addEventListener('change', (e) => {
      handleImportJson(e.target.files[0], importFileInputMain);
    });
  }

  // 책갈피(Bookmark) 데이터 관리
  const loadBookmarks = () => {
    try {
      return JSON.parse(localStorage.getItem('reader_bookmarks') || '{}');
    } catch {
      return {};
    }
  };

  const saveBookmarks = (bookmarks) => {
    localStorage.setItem('reader_bookmarks', JSON.stringify(bookmarks));
  };

  const updateBookmarkButtonState = () => {
    const bookmarks = loadBookmarks();
    if (bookmarks[currentFileName] && bookmarks[currentFileName].includes(currentChapterIndex)) {
      btnBookmark.classList.add('active');
    } else {
      btnBookmark.classList.remove('active');
    }
  };

  btnBookmark.addEventListener('click', () => {
    if (!currentFileName) return;
    
    const bookmarks = loadBookmarks();
    if (!bookmarks[currentFileName]) {
      bookmarks[currentFileName] = [];
    }
    
    const chapterList = bookmarks[currentFileName];
    const indexInArray = chapterList.indexOf(currentChapterIndex);
    
    if (indexInArray === -1) {
      chapterList.push(currentChapterIndex);
      btnBookmark.classList.add('active');
    } else {
      chapterList.splice(indexInArray, 1);
      btnBookmark.classList.remove('active');
    }
    
    saveBookmarks(bookmarks);
    renderChaptersTOC();
  });

  // 스크롤 저장 (책별 독립 기록)
  window.addEventListener('scroll', () => {
    if (!viewerContainer.classList.contains('active') || chapters.length === 0 || !currentFileName) return;
    
    if (scrollSaveTimeout) clearTimeout(scrollSaveTimeout);
    
    scrollSaveTimeout = setTimeout(() => {
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      if (docHeight > 0) {
        const ratio = window.scrollY / docHeight;
        localStorage.setItem(`reader_scroll_ratio_${currentFileName}`, ratio.toString());
      }
    }, 300);
  });


  // ==========================================================================
  // [5단계 고도화] 실시간 동기화 폴더 연동 (File System Access API)
  // ==========================================================================
  
  btnSyncFolder.addEventListener('click', async () => {
    if (!window.showDirectoryPicker) {
      alert('⚠️ 현재 사용 중이신 브라우저는 실시간 폴더 동기화 기능을 지원하지 않습니다.\n크롬(Chrome), 엣지(Edge), 웨일(Whale) 등 크로미움 기반의 최신 PC 브라우저를 사용해 주세요.');
      return;
    }

    try {
      const dirHandle = await window.showDirectoryPicker();
      const files = await readFilesFromDirectoryHandle(dirHandle);
      
      const txtFiles = files.filter(f => f.name.toLowerCase().endsWith('.txt'));
      if (txtFiles.length === 0) {
        alert('⚠️ 선택한 폴더 내에 TXT 텍스트 파일이 없습니다.');
        return;
      }

      const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
      txtFiles.sort((a, b) => collator.compare(a.name, b.name));

      const readPromises = txtFiles.map(file => {
        return new Promise((resolve) => {
          const reader = new FileReader();
          reader.readAsText(file, 'utf-8');
          reader.onload = (e) => {
            let text = e.target.result;
            const replacementCharCount = (text.match(/\uFFFD/g) || []).length;
            const koreanCharCount = (text.match(/[가-힣]/g) || []).length;
            const cleanTitle = file.name.replace(/\.txt$/i, '');
            
            if (replacementCharCount > 5 || (koreanCharCount === 0 && text.length > 200)) {
              const retryReader = new FileReader();
              retryReader.readAsText(file, 'euc-kr');
              retryReader.onload = (retryEvent) => {
                resolve({ title: cleanTitle, content: retryEvent.target.result });
              };
            } else {
              resolve({ title: cleanTitle, content: text });
            }
          };
        });
      });

      const parsedChapters = await Promise.all(readPromises);
      
      currentFileName = dirHandle.name;
      await saveBook(currentFileName, parsedChapters, dirHandle);
      
      localStorage.setItem('reader_active_book_title', currentFileName);
      
      chapters = parsedChapters;
      currentChapterIndex = 0;
      localStorage.setItem(`reader_current_chapter_${currentFileName}`, '0');
      localStorage.setItem(`reader_scroll_ratio_${currentFileName}`, '0');

      uploadContainer.classList.remove('active');
      viewerContainer.classList.add('active');
      
      renderChaptersTOC();
      displayChapter(currentChapterIndex);
      alert(`🔄 [${currentFileName}] 폴더가 실시간 동기화 책장으로 연동되었습니다.\n앞으로 이 폴더에 텍스트 파일이 추가되면 켤 때 자동으로 인식합니다!`);

    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error('폴더 연동 실패:', err);
        alert('폴더 연동 중 오류가 발생했습니다.');
      }
    }
  });


  // ==========================================================================
  // [2단계 보완] 파일/폴더 로딩 및 챕터 렌더링 로직 통합
  // ==========================================================================

  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      loadTextFile(e.target.files[0]);
    }
  });

  folderInput.addEventListener('change', (e) => {
    const files = Array.from(e.target.files);
    const txtFiles = files.filter(f => f.name.toLowerCase().endsWith('.txt'));
    
    if (txtFiles.length > 0) {
      const firstFile = txtFiles[0];
      const folderName = firstFile.webkitRelativePath.split('/')[0] || '선택한 폴더';
      processMultipleFiles(txtFiles, folderName);
    } else {
      alert('⚠️ 선택한 폴더 내에 TXT 텍스트 파일이 없습니다.');
    }
  });

  ['dragenter', 'dragover'].forEach(eventName => {
    uploadBox.addEventListener(eventName, (e) => {
      e.preventDefault();
      uploadBox.style.borderColor = 'var(--color-primary)';
      uploadBox.style.backgroundColor = 'var(--color-bg)';
    }, false);
  });

  ['dragleave', 'drop'].forEach(eventName => {
    uploadBox.addEventListener(eventName, (e) => {
      e.preventDefault();
      uploadBox.style.borderColor = '';
      uploadBox.style.backgroundColor = '';
    }, false);
  });

  uploadBox.addEventListener('drop', async (e) => {
    e.preventDefault();
    uploadBox.style.borderColor = '';
    uploadBox.style.backgroundColor = '';
    
    const items = e.dataTransfer.items;
    if (items.length > 0) {
      const entry = items[0].webkitGetAsEntry();
      if (entry) {
        if (entry.isDirectory) {
          const files = await readDirectoryEntry(entry);
          const txtFiles = files.filter(f => f.name.toLowerCase().endsWith('.txt'));
          if (txtFiles.length > 0) {
            processMultipleFiles(txtFiles, entry.name);
          } else {
            alert('⚠️ 폴더 내에 TXT 파일이 없습니다.');
          }
        } else {
          const file = e.dataTransfer.files[0];
          if (file.name.toLowerCase().endsWith('.txt')) {
            loadTextFile(file);
          } else {
            alert('⚠️ TXT 텍스트 파일만 불러올 수 있습니다.');
          }
        }
      }
    }
  });

  function readDirectoryEntry(directoryEntry) {
    return new Promise((resolve) => {
      const files = [];
      const dirReader = directoryEntry.createReader();
      
      const readEntries = () => {
        dirReader.readEntries((entries) => {
          if (entries.length === 0) {
            resolve(files);
          } else {
            const promises = entries.map(entry => {
              if (entry.isFile) {
                return new Promise(res => {
                  entry.file(f => {
                    files.push(f);
                    res();
                  });
                });
              } else if (entry.isDirectory) {
                return readDirectoryEntry(entry).then(subFiles => {
                  files.push(...subFiles);
                });
              }
              return Promise.resolve();
            });
            Promise.all(promises).then(readEntries);
          }
        });
      };
      dirReader.readEntries((entries) => {
        if (entries.length === 0) resolve(files);
        else readEntries();
      });
    });
  }

  function loadTextFile(file) {
    currentFileName = file.name;
    const reader = new FileReader();
    
    reader.readAsText(file, 'utf-8');
    reader.onload = (e) => {
      let text = e.target.result;
      const replacementCharCount = (text.match(/\uFFFD/g) || []).length;
      const koreanCharCount = (text.match(/[가-힣]/g) || []).length;
      
      if (replacementCharCount > 5 || (koreanCharCount === 0 && text.length > 200)) {
        const retryReader = new FileReader();
        retryReader.readAsText(file, 'euc-kr');
        retryReader.onload = (retryEvent) => {
          processRawText(retryEvent.target.result);
        };
      } else {
        processRawText(text);
      }
    };
  }

  function processRawText(rawText) {
    const lines = rawText.split(/\r?\n/);
    const chapterRegex = /^\s*(제\s*\d+\s*[화장편]|chapter\s*\d+|[#＃]\s*\d+|\d+\s*화|\d+\s*장)\b/i;
    
    chapters = [];
    let currentChapter = {
      title: '시작하기',
      lines: []
    };
    
    let detectedChapterCount = 0;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (chapterRegex.test(line)) {
        if (currentChapter.lines.length > 0 || detectedChapterCount > 0) {
          chapters.push({
            title: currentChapter.title,
            content: currentChapter.lines.join('\n')
          });
        }
        currentChapter = {
          title: line.trim(),
          lines: []
        };
        detectedChapterCount++;
      } else {
        currentChapter.lines.push(line);
      }
    }
    
    if (currentChapter.lines.length > 0 || detectedChapterCount > 0) {
      chapters.push({
        title: currentChapter.title,
        content: currentChapter.lines.join('\n')
      });
    }
    
    if (chapters.length < 3) {
      chapters = splitTextIntoChaptersByLength(rawText, 3500);
    }
    
    saveBook(currentFileName, chapters).then(() => {
      localStorage.setItem('reader_active_book_title', currentFileName);
      
      currentChapterIndex = 0;
      localStorage.setItem(`reader_current_chapter_${currentFileName}`, '0');
      localStorage.setItem(`reader_scroll_ratio_${currentFileName}`, '0');
      
      uploadContainer.classList.remove('active');
      viewerContainer.classList.add('active');
      
      renderChaptersTOC();
      displayChapter(currentChapterIndex);
    });
  }

  function processMultipleFiles(files, folderName) {
    currentFileName = folderName;
    
    const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
    files.sort((a, b) => collator.compare(a.name, b.name));
    
    const readPromises = files.map(file => {
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.readAsText(file, 'utf-8');
        reader.onload = (e) => {
          let text = e.target.result;
          const replacementCharCount = (text.match(/\uFFFD/g) || []).length;
          const koreanCharCount = (text.match(/[가-힣]/g) || []).length;
          
          const cleanTitle = file.name.replace(/\.txt$/i, '');
          
          if (replacementCharCount > 5 || (koreanCharCount === 0 && text.length > 200)) {
            const retryReader = new FileReader();
            retryReader.readAsText(file, 'euc-kr');
            retryReader.onload = (retryEvent) => {
              resolve({ title: cleanTitle, content: retryEvent.target.result });
            };
          } else {
            resolve({ title: cleanTitle, content: text });
          }
        };
      });
    });
    
    Promise.all(readPromises).then(parsedChapters => {
      chapters = parsedChapters;
      
      saveBook(currentFileName, chapters).then(() => {
        localStorage.setItem('reader_active_book_title', currentFileName);
        
        currentChapterIndex = 0;
        localStorage.setItem(`reader_current_chapter_${currentFileName}`, '0');
        localStorage.setItem(`reader_scroll_ratio_${currentFileName}`, '0');
        
        uploadContainer.classList.remove('active');
        viewerContainer.classList.add('active');
        
        renderChaptersTOC();
        displayChapter(currentChapterIndex);
      });
    });
  }

  function splitTextIntoChaptersByLength(text, limit) {
    const result = [];
    let startIdx = 0;
    let chapterNum = 1;
    
    while (startIdx < text.length) {
      if (startIdx + limit >= text.length) {
        result.push({
          title: `제 ${chapterNum}장`,
          content: text.slice(startIdx)
        });
        break;
      }
      
      let endIdx = startIdx + limit;
      let foundCleanBreak = false;
      const searchWindow = 200;
      
      for (let offset = 0; offset < searchWindow; offset++) {
        const checkIdx = endIdx + offset;
        const char = text.charAt(checkIdx);
        if (char === '\n' || char === '.' || char === '!' || char === '?') {
          endIdx = checkIdx + 1;
          foundCleanBreak = true;
          break;
        }
      }
      
      if (!foundCleanBreak) {
        const nextSpace = text.indexOf(' ', endIdx);
        if (nextSpace !== -1 && nextSpace < endIdx + 50) {
          endIdx = nextSpace + 1;
        }
      }
      
      result.push({
        title: `제 ${chapterNum}장`,
        content: text.slice(startIdx, endIdx)
      });
      
      startIdx = endIdx;
      chapterNum++;
    }
    
    return result;
  }

  function displayChapter(index, restoreScroll = false) {
    if (index < 0 || index >= chapters.length) return;
    currentChapterIndex = index;
    
    const chapter = chapters[index];
    chapterTitleEl.textContent = chapter.title;
    
    const contentLines = chapter.content.split('\n');
    let htmlContent = '';
    
    contentLines.forEach(line => {
      const trimmed = line.trim();
      if (trimmed) {
        htmlContent += `<p class="novel-p">${trimmed}</p>`;
      } else {
        htmlContent += `<p class="novel-p"></p>`;
      }
    });
    
    readingContent.innerHTML = htmlContent;
    
    if (restoreScroll) {
      setTimeout(() => {
        const savedRatio = parseFloat(localStorage.getItem(`reader_scroll_ratio_${currentFileName}`) || '0');
        const docHeight = document.documentElement.scrollHeight - window.innerHeight;
        if (docHeight > 0 && savedRatio > 0) {
          window.scrollTo({ top: docHeight * savedRatio, behavior: 'instant' });
        } else {
          window.scrollTo({ top: 0, behavior: 'instant' });
        }
      }, 50);
    } else {
      window.scrollTo({ top: 0, behavior: 'instant' });
      localStorage.setItem(`reader_scroll_ratio_${currentFileName}`, '0');
    }
    
    localStorage.setItem(`reader_current_chapter_${currentFileName}`, currentChapterIndex.toString());
    
    updateTOCSelection();
    updateProgressBar();
    updateBookmarkButtonState();
  }

  // 목차 렌더링 최적화 및 검색 필터링 지원
  function renderChaptersTOC(filterQuery = '') {
    const bookmarks = loadBookmarks();
    const bookBookmarks = bookmarks[currentFileName] || [];
    
    let html = '';
    const q = filterQuery.toLowerCase().trim();
    
    // 1. 검색어가 없을 때 최상단 책갈피 고정 섹션 노출
    if (!q && bookBookmarks.length > 0) {
      html += `<li class="toc-section-header" style="padding: 0.6rem 1.5rem; font-size: 0.8rem; color: var(--color-primary); font-weight: bold; background-color: var(--color-bg); border-bottom: 1px solid var(--color-border); font-family: var(--font-sans); display: flex; align-items: center; gap: 4px;">📌 책갈피 한 화</li>`;
      chapters.forEach((chapter, index) => {
        if (bookBookmarks.includes(index)) {
          const isActive = index === currentChapterIndex ? 'active' : '';
          html += `<li class="${isActive}" data-index="${index}"><a href="#">🔖 ${chapter.title}</a></li>`;
        }
      });
      html += `<li class="toc-section-header" style="padding: 0.6rem 1.5rem; font-size: 0.8rem; color: var(--color-text-muted); font-weight: bold; background-color: var(--color-bg); border-bottom: 1px solid var(--color-border); border-top: 1px solid var(--color-border); font-family: var(--font-sans); display: flex; align-items: center; gap: 4px;">📖 전체 목차</li>`;
    }
    
    // 2. 전체 목록 (검색어가 있을 경우 필터링 적용)
    chapters.forEach((chapter, index) => {
      const hasBookmark = bookBookmarks.includes(index);
      
      if (q) {
        const isSearchBookmark = q === '🔖' || q === '책갈피' || q === 'bookmark';
        if (isSearchBookmark) {
          if (!hasBookmark) return;
        } else if (!chapter.title.toLowerCase().includes(q)) {
          return; // 검색어가 포함되지 않은 화는 목록에서 건너뜀
        }
      }
      
      const isActive = index === currentChapterIndex ? 'active' : '';
      html += `<li class="${isActive}" data-index="${index}"><a href="#">${hasBookmark ? '🔖 ' : ''}${chapter.title}</a></li>`;
    });
    
    tocList.innerHTML = html;
  }

  // 목차 클릭 이벤트 위임
  tocList.addEventListener('click', (e) => {
    e.preventDefault();
    const li = e.target.closest('li');
    if (li && li.dataset.index !== undefined) {
      const index = parseInt(li.dataset.index, 10);
      displayChapter(index);
      closeToc();
    }
  });

  function updateTOCSelection() {
    const listItems = tocList.querySelectorAll('li');
    listItems.forEach((li, index) => {
      if (index === currentChapterIndex) {
        li.classList.add('active');
      } else {
        li.classList.remove('active');
      }
    });
  }

  function updateProgressBar() {
    if (chapters.length === 0) return;
    const progress = ((currentChapterIndex + 1) / chapters.length) * 100;
    progressBar.style.width = `${progress}%`;
  }

  const moveToPrevChapter = () => {
    if (currentChapterIndex > 0) {
      displayChapter(currentChapterIndex - 1);
    } else {
      alert('첫 번째 챕터입니다.');
    }
  };

  const moveToNextChapter = () => {
    if (currentChapterIndex < chapters.length - 1) {
      displayChapter(currentChapterIndex + 1);
    } else {
      alert('마지막 챕터입니다.');
    }
  };

  document.getElementById('btn-prev-chapter-top').addEventListener('click', moveToPrevChapter);
  document.getElementById('btn-prev-chapter-bottom').addEventListener('click', moveToPrevChapter);
  document.getElementById('btn-next-chapter-top').addEventListener('click', moveToNextChapter);
  document.getElementById('btn-next-chapter-bottom').addEventListener('click', moveToNextChapter);
  
});
