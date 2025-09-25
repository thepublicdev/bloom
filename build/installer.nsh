; NSIS Installer Script for Bloom
; This script customizes the Windows installer

; Add custom installer text
!macro customHeader
  !system "echo 'Building Bloom installer...'"
!macroend

; Custom installer pages or modifications can be added here
!macro customInit
  ; Add any custom initialization code
!macroend

; Custom uninstaller modifications
!macro customUnInit
  ; Add any custom uninstall code
!macroend

; Registry entries for file associations (optional)
!macro customInstall
  ; Register Bloom as a video application
  WriteRegStr HKLM "SOFTWARE\Classes\.webm\OpenWithProgids" "Bloom.webm" ""
  WriteRegStr HKLM "SOFTWARE\Classes\Bloom.webm" "" "Bloom Video File"
  WriteRegStr HKLM "SOFTWARE\Classes\Bloom.webm\DefaultIcon" "" "$INSTDIR\Bloom.exe,0"
!macroend

!macro customUnInstall
  ; Clean up registry entries
  DeleteRegKey HKLM "SOFTWARE\Classes\.webm\OpenWithProgids\Bloom.webm"
  DeleteRegKey HKLM "SOFTWARE\Classes\Bloom.webm"
!macroend
