# diariocosmos

Uma pequena aplicação web para explorar a Imagem Astronômica do Dia da NASA (APOD).

## Como usar

É necessário ter Node.js 18 ou superior. No PowerShell, informe sua chave sem gravá-la no comando ou no histórico e inicie o servidor:

```powershell
$secureKey = Read-Host "Chave da NASA" -AsSecureString
$env:NASA_API_KEY = (New-Object System.Net.NetworkCredential("", $secureKey)).Password
Remove-Variable secureKey
node server.js
```

Abra `http://localhost:3000`. A página carrega a APOD de hoje; use o seletor para escolher outra data. O servidor consulta a API da NASA e mantém a chave fora do HTML, do JavaScript e das requisições do navegador. Se a API retornar metadados genéricos, o servidor busca os dados na página oficial do APOD. Ao encerrar o servidor, remova a variável com `$env:NASA_API_KEY = $null`.
