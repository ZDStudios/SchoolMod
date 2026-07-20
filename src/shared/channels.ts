// Centralised IPC channel names, shared by preload + main.
export const CH = {
  // window controls
  winMinimize: 'win:minimize',
  winMaximizeToggle: 'win:maximizeToggle',
  winClose: 'win:close',
  winIsMaximized: 'win:isMaximized',

  // settings
  settingsGet: 'settings:get',
  settingsSet: 'settings:set',

  // claude
  claudeChat: 'claude:chat',
  claudeChatStream: 'claude:chatStream',
  claudeStreamChunk: 'claude:streamChunk',
  claudePing: 'claude:ping',
  claudeStatus: 'claude:status',
  claudeInstall: 'claude:install',
  claudeLogin: 'claude:login',
  claudeSetupLog: 'claude:setupLog',
  claudeLoginUrl: 'claude:loginUrl',

  // agent (tool-using assistant)
  agentChat: 'agent:chat',
  agentTool: 'agent:tool',
  settingsChanged: 'settings:changed',

  // seqta
  seqtaLogin: 'seqta:login',
  seqtaTestMcp: 'seqta:testMcp',
  seqtaConnectSso: 'seqta:connectSso',
  seqtaMe: 'seqta:me',
  seqtaPhoto: 'seqta:photo',
  seqtaTimetable: 'seqta:timetable',
  seqtaTimetableWeek: 'seqta:timetableWeek',
  seqtaAssessments: 'seqta:assessments',
  seqtaNotices: 'seqta:notices',
  seqtaHomework: 'seqta:homework',
  seqtaGrades: 'seqta:grades',
  seqtaMessages: 'seqta:messages',
  seqtaReports: 'seqta:reports',
  seqtaOpenReport: 'seqta:openReport',
  seqtaLogout: 'seqta:logout',

  // notebooks
  nbList: 'nb:list',
  nbCreate: 'nb:create',
  nbDelete: 'nb:delete',
  nbAddSourceText: 'nb:addSourceText',
  nbAddSourceFiles: 'nb:addSourceFiles',
  nbRemoveSource: 'nb:removeSource',
  nbAsk: 'nb:ask',
  nbSummarise: 'nb:summarise',
  nbStudyGuide: 'nb:studyGuide',
  nbSaveChat: 'nb:saveChat',

  // flashcards
  deckList: 'deck:list',
  deckCreate: 'deck:create',
  deckDelete: 'deck:delete',
  deckGenerate: 'deck:generate',
  deckAddCard: 'deck:addCard',
  deckReview: 'deck:review',
  deckUpdate: 'deck:update',

  // microsoft
  msGraph: 'ms:graph',
  msDeviceLogin: 'ms:deviceLogin',
  msOpenApp: 'ms:openApp',
  msQuickConnect: 'ms:quickConnect',
  msRecentFiles: 'ms:recentFiles',
  msOneNote: 'ms:oneNote',
  msReadNotebook: 'ms:readNotebook',
  msGetNotebookUrl: 'ms:getNotebookUrl',

  // misc
  openExternal: 'app:openExternal',
  saveFile: 'app:saveFile'
} as const
