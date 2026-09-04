// ==========================================================================
// 서재 보안 인증 설정 (auth-config.js)
// ==========================================================================

window.AUTH_PROFILES = {
  profile1: {
    id: 'profile1',
    name: '서재 1',
    badgeClass: 'badge-library-1',
    // 서재 1 비밀번호: 1234!!
    hash: '801474e17f4d14167e0294c328570210c0803ca0c5cb437982024e0b80888f4e',
    dbName: 'TXTReaderDB', // 기존에 저장된 도서와 호환 유지
    storagePrefix: 'p1_'
  },
  profile2: {
    id: 'profile2',
    name: '서재 2',
    badgeClass: 'badge-library-2',
    // 서재 2 비밀번호: 0817!! (기존 Schedule 비밀번호)
    hash: '4417e9d3ebf53ef7033b6f05f7c19272baaf187eafd6459c7c1268e0abc26d22',
    dbName: 'TXTReaderDB_p2',
    storagePrefix: 'p2_'
  }
};
