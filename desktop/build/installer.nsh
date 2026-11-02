; 阿豆OFD 卸载时清理应用运行时写入的每用户文件关联
; 与 desktop/src/main/windows-integration.ts 中的注册项保持一致
!macro customUnInstall
  DeleteRegValue HKCU "Software\Classes\.ofd\OpenWithProgids" "AdouOFD.OFD"
  DeleteRegValue HKCU "Software\Classes\.ofd\OpenWithProgids" "AdouOFD.PDF"
  DeleteRegValue HKCU "Software\Classes\.ofd\OpenWithProgids" "AdouOFD.Document"
  DeleteRegValue HKCU "Software\Classes\.pdf\OpenWithProgids" "AdouOFD.OFD"
  DeleteRegValue HKCU "Software\Classes\.pdf\OpenWithProgids" "AdouOFD.PDF"
  DeleteRegValue HKCU "Software\Classes\.pdf\OpenWithProgids" "AdouOFD.Document"

  ReadRegStr $1 HKCU "Software\AdouOFD" "PreviousOfdDefault"
  ReadRegStr $0 HKCU "Software\Classes\.ofd" ""
  StrCmp $0 "AdouOFD.OFD" ofd_owned
  StrCmp $0 "AdouOFD.Document" ofd_owned
  Goto ofd_default_done

  ofd_owned:
    StrCmp $1 "" 0 ofd_restore
    DeleteRegValue HKCU "Software\Classes\.ofd" ""
    Goto ofd_default_done

  ofd_restore:
    WriteRegStr HKCU "Software\Classes\.ofd" "" "$1"

  ofd_default_done:
  DeleteRegKey HKCU "Software\Classes\AdouOFD.OFD"
  DeleteRegKey HKCU "Software\Classes\AdouOFD.PDF"
  DeleteRegKey HKCU "Software\Classes\AdouOFD.Document"
  DeleteRegKey HKCU "Software\AdouOFD"
  DeleteRegValue HKCU "Software\RegisteredApplications" "AdouOFD"

  ; 重新安装时恢复“默认自动注册”，不保留上次的 optedOut/路径记录
  Delete "$APPDATA\adou-ofd\windows-integration.json"
!macroend
