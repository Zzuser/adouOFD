#define AppName "阿豆OFD"
#ifndef AppVersion
  #define AppVersion "1.1.0"
#endif
#ifndef SourceDir
  #define SourceDir "..\..\desktop\dist-inno-stage\win-unpacked"
#endif
#ifndef OutputDir
  #define OutputDir "..\..\desktop\dist-inno"
#endif
#ifndef RepoRoot
  #define RepoRoot "..\.."
#endif

[Setup]
AppId={{d09bb7f8-1672-426c-9d21-be3e2253090b}
AppName={#AppName}
AppVersion={#AppVersion}
AppVerName={#AppName} {#AppVersion}
AppPublisher=Zzuser
AppPublisherURL=https://gitcode.com/Zzuser/adouOFD
AppSupportURL=https://gitcode.com/Zzuser/adouOFD
AppUpdatesURL=https://gitcode.com/Zzuser/adouOFD
DefaultDirName={localappdata}\Programs\阿豆OFD
DefaultGroupName=阿豆OFD
DisableProgramGroupPage=yes
UsePreviousAppDir=yes
UsePreviousTasks=yes
UsePreviousLanguage=yes
PrivilegesRequired=lowest
OutputDir={#OutputDir}
OutputBaseFilename=阿豆OFD-{#AppVersion}-x64-inno
SetupIconFile={#RepoRoot}\desktop\build\icon.ico
UninstallDisplayIcon={app}\阿豆OFD.exe
LicenseFile={#RepoRoot}\LICENSE
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0
CloseApplications=yes
RestartApplications=no
AllowNoIcons=yes
ChangesAssociations=yes
SetupLogging=yes
VersionInfoVersion={#AppVersion}
VersionInfoCompany=Zzuser
VersionInfoDescription=阿豆OFD 安装程序
VersionInfoProductName=阿豆OFD
VersionInfoProductVersion={#AppVersion}

[Languages]
Name: "chinesesimplified"; MessagesFile: "{#RepoRoot}\scripts\inno\ChineseSimplified.isl"

[Tasks]
Name: "associate"; Description: "关联 .ofd / .pdf / .md 文件类型（加入“打开方式”，不覆盖现有默认应用）"; GroupDescription: "文件关联："; Flags: checkedonce
Name: "desktopicon"; Description: "创建桌面快捷方式"; GroupDescription: "附加任务："; Flags: checkedonce

[Files]
Source: "{#SourceDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autoprograms}\阿豆OFD"; Filename: "{app}\阿豆OFD.exe"; WorkingDir: "{app}"
Name: "{autodesktop}\阿豆OFD"; Filename: "{app}\阿豆OFD.exe"; WorkingDir: "{app}"; Tasks: desktopicon

[Run]
Filename: "{app}\阿豆OFD.exe"; Description: "启动阿豆OFD"; Flags: nowait postinstall skipifsilent

[Code]
const
  ProgIdOfd = 'AdouOFD.OFD';
  ProgIdPdf = 'AdouOFD.PDF';
  ProgIdMd = 'AdouOFD.MD';
  LegacyProgId = 'AdouOFD.Document';
  AppKey = 'AdouOFD';
  AppDescription = '免费、离线的 OFD / PDF / Markdown 查看与处理工具';

var
  PreviousOfdDefault: String;

function Quote(const Value: String): String;
begin
  Result := '"' + Value + '"';
end;

function AppExe: String;
begin
  Result := ExpandConstant('{app}\阿豆OFD.exe');
end;

function IconPath(const FileName: String): String;
begin
  Result := ExpandConstant('{app}\resources\fileicons\' + FileName);
end;

function IsOurProgId(const Value: String): Boolean;
begin
  Result := (Value = ProgIdOfd) or (Value = ProgIdPdf) or (Value = ProgIdMd) or (Value = LegacyProgId);
end;

function TasksSpecified: Boolean;
var
  Index: Integer;
  Param: String;
begin
  Result := False;
  for Index := 1 to ParamCount do
  begin
    Param := Uppercase(ParamStr(Index));
    if Pos('/TASKS', Param) = 1 then
    begin
      Result := True;
      Exit;
    end;
  end;
end;

function AssociationExists: Boolean;
begin
  Result :=
    RegValueExists(HKCU, 'Software\Classes\' + ProgIdOfd + '\shell\open\command', '') and
    RegValueExists(HKCU, 'Software\Classes\' + ProgIdPdf + '\shell\open\command', '') and
    RegValueExists(HKCU, 'Software\Classes\' + ProgIdMd + '\shell\open\command', '') and
    RegValueExists(HKCU, 'Software\Classes\.ofd\OpenWithProgids', ProgIdOfd) and
    RegValueExists(HKCU, 'Software\Classes\.pdf\OpenWithProgids', ProgIdPdf) and
    RegValueExists(HKCU, 'Software\Classes\.md\OpenWithProgids', ProgIdMd);
end;

function HasUserChoice(const Ext: String): Boolean;
var
  Value: String;
begin
  Result := RegQueryStringValue(HKCU,
    'Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\.' + Ext + '\UserChoice',
    'ProgId', Value);
end;

function ReadDefaultProgId(const Ext: String): String;
var
  Value: String;
begin
  if RegQueryStringValue(HKCU, 'Software\Classes\.' + Ext, '', Value) then
    Result := Value
  else
    Result := '';
end;

function JsonEscape(const Value: String): String;
begin
  Result := Value;
  StringChangeEx(Result, '\', '\\', True);
  StringChangeEx(Result, '"', '\"', True);
end;

procedure RefreshShell;
var
  ResultCode: Integer;
begin
  Exec(ExpandConstant('{sys}\ie4uinit.exe'), '-show', '', SW_HIDE,
    ewWaitUntilTerminated, ResultCode);
end;

procedure WriteIntegrationConfig(const OptedOut: Boolean);
var
  ConfigDir: String;
  Content: String;
begin
  ConfigDir := ExpandConstant('{userappdata}\adou-ofd');
  ForceDirectories(ConfigDir);
  if OptedOut then
    Content := '{"optedOut":true}'
  else
    Content := '{"optedOut":false,"previousOfdDefault":"' +
      JsonEscape(PreviousOfdDefault) + '"}';
  SaveStringToFile(ConfigDir + '\windows-integration.json', Content, False);
end;

procedure WriteProgId(const ProgId, TypeName, IconFile: String);
var
  Key: String;
begin
  Key := 'Software\Classes\' + ProgId;
  RegWriteStringValue(HKCU, Key, '', TypeName);
  RegWriteStringValue(HKCU, Key, 'FriendlyTypeName', TypeName);
  RegWriteStringValue(HKCU, Key, 'Application', '阿豆OFD');
  RegWriteStringValue(HKCU, Key + '\DefaultIcon', '',
    Quote(IconPath(IconFile)) + ',0');
  RegWriteStringValue(HKCU, Key + '\shell', '', 'open');
  RegWriteStringValue(HKCU, Key + '\shell\open', '', '用阿豆OFD打开');
  RegWriteStringValue(HKCU, Key + '\shell\open\command', '', Quote(AppExe) + ' "%1"');
end;

procedure RegisterAssociations;
var
  Current: String;
  Saved: String;
begin
  PreviousOfdDefault := '';
  if RegQueryStringValue(HKCU, 'Software\' + AppKey, 'PreviousOfdDefault', Saved) and
     (Saved <> '') and (not IsOurProgId(Saved)) then
    PreviousOfdDefault := Saved;

  WriteProgId(ProgIdOfd, 'OFD 文档', 'ofd-file.ico');
  RegWriteStringValue(HKCU, 'Software\Classes\.ofd\OpenWithProgids', ProgIdOfd, '');
  if not HasUserChoice('ofd') then
  begin
    Current := ReadDefaultProgId('ofd');
    if (Current <> '') and (not IsOurProgId(Current)) then
      PreviousOfdDefault := Current;
    RegWriteStringValue(HKCU, 'Software\Classes\.ofd', '', ProgIdOfd);
  end;

  WriteProgId(ProgIdPdf, 'PDF 文档', 'pdf-file.ico');
  RegWriteStringValue(HKCU, 'Software\Classes\.pdf\OpenWithProgids', ProgIdPdf, '');

  WriteProgId(ProgIdMd, 'Markdown 文档', 'md-file.ico');
  RegWriteStringValue(HKCU, 'Software\Classes\.md\OpenWithProgids', ProgIdMd, '');

  RegDeleteValue(HKCU, 'Software\Classes\.ofd\OpenWithProgids', LegacyProgId);
  RegDeleteValue(HKCU, 'Software\Classes\.pdf\OpenWithProgids', LegacyProgId);
  RegDeleteValue(HKCU, 'Software\Classes\.md\OpenWithProgids', LegacyProgId);
  if (not HasUserChoice('ofd')) and (not HasUserChoice('pdf')) then
    RegDeleteKeyIncludingSubkeys(HKCU, 'Software\Classes\' + LegacyProgId);

  RegWriteStringValue(HKCU, 'Software\' + AppKey + '\Capabilities',
    'ApplicationName', '阿豆OFD');
  RegWriteStringValue(HKCU, 'Software\' + AppKey + '\Capabilities',
    'ApplicationDescription', AppDescription);
  RegWriteStringValue(HKCU, 'Software\' + AppKey + '\Capabilities',
    'ApplicationIcon', Quote(AppExe) + ',0');
  RegWriteStringValue(HKCU, 'Software\' + AppKey + '\Capabilities\FileAssociations',
    '.ofd', ProgIdOfd);
  RegWriteStringValue(HKCU, 'Software\' + AppKey + '\Capabilities\FileAssociations',
    '.pdf', ProgIdPdf);
  RegWriteStringValue(HKCU, 'Software\' + AppKey + '\Capabilities\FileAssociations',
    '.md', ProgIdMd);
  RegWriteStringValue(HKCU, 'Software\RegisteredApplications', AppKey,
    'Software\' + AppKey + '\Capabilities');
  RegWriteStringValue(HKCU, 'Software\' + AppKey, 'PreviousOfdDefault',
    PreviousOfdDefault);

  WriteIntegrationConfig(False);
  RefreshShell;
end;

procedure RemoveAssociations;
var
  Current: String;
  Saved: String;
begin
  RegDeleteValue(HKCU, 'Software\Classes\.ofd\OpenWithProgids', ProgIdOfd);
  RegDeleteValue(HKCU, 'Software\Classes\.ofd\OpenWithProgids', ProgIdPdf);
  RegDeleteValue(HKCU, 'Software\Classes\.ofd\OpenWithProgids', LegacyProgId);
  RegDeleteValue(HKCU, 'Software\Classes\.pdf\OpenWithProgids', ProgIdOfd);
  RegDeleteValue(HKCU, 'Software\Classes\.pdf\OpenWithProgids', ProgIdPdf);
  RegDeleteValue(HKCU, 'Software\Classes\.pdf\OpenWithProgids', LegacyProgId);
  RegDeleteValue(HKCU, 'Software\Classes\.md\OpenWithProgids', ProgIdOfd);
  RegDeleteValue(HKCU, 'Software\Classes\.md\OpenWithProgids', ProgIdPdf);
  RegDeleteValue(HKCU, 'Software\Classes\.md\OpenWithProgids', ProgIdMd);
  RegDeleteValue(HKCU, 'Software\Classes\.md\OpenWithProgids', LegacyProgId);

  Saved := '';
  RegQueryStringValue(HKCU, 'Software\' + AppKey, 'PreviousOfdDefault', Saved);
  if RegQueryStringValue(HKCU, 'Software\Classes\.ofd', '', Current) and
     IsOurProgId(Current) then
  begin
    if (Saved <> '') and (not IsOurProgId(Saved)) then
      RegWriteStringValue(HKCU, 'Software\Classes\.ofd', '', Saved)
    else
      RegDeleteValue(HKCU, 'Software\Classes\.ofd', '');
  end;

  RegDeleteKeyIncludingSubkeys(HKCU, 'Software\Classes\' + ProgIdOfd);
  RegDeleteKeyIncludingSubkeys(HKCU, 'Software\Classes\' + ProgIdPdf);
  RegDeleteKeyIncludingSubkeys(HKCU, 'Software\Classes\' + ProgIdMd);
  RegDeleteKeyIncludingSubkeys(HKCU, 'Software\Classes\' + LegacyProgId);
  RegDeleteKeyIncludingSubkeys(HKCU, 'Software\' + AppKey);
  RegDeleteValue(HKCU, 'Software\RegisteredApplications', AppKey);
  RefreshShell;
end;

procedure PreserveAssociations;
var
  Saved: String;
begin
  PreviousOfdDefault := '';
  if RegQueryStringValue(HKCU, 'Software\' + AppKey, 'PreviousOfdDefault', Saved) then
    PreviousOfdDefault := Saved;
  WriteIntegrationConfig(False);
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssPostInstall then
  begin
    if WizardIsTaskSelected('associate') then
      RegisterAssociations
    else if WizardSilent and (not TasksSpecified) and AssociationExists then
      PreserveAssociations
    else
    begin
      RemoveAssociations;
      WriteIntegrationConfig(True);
    end;
  end;
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
begin
  if CurUninstallStep = usUninstall then
  begin
    RemoveAssociations;
    DeleteFile(ExpandConstant('{userappdata}\adou-ofd\windows-integration.json'));
  end;
end;
