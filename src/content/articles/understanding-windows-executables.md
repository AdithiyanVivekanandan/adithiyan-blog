---
title: "Windows Executable Analysis: PE Format and Runtime"
subtitle: "A reproducible walkthrough of PE32+ headers, imports, x86-64 startup code and Ghidra disassembly"
slug: "understanding-windows-executables"
description: "Analyze a Windows executable from C source to PE32+ structure, imports, startup code and Ghidra disassembly, with reproducible commands and evidence."
status: published
publishedAt: 2026-10-17T20:00:00Z
topics:
  - reverse-engineering
  - systems-tooling
articleType: tutorial
# TODO(author): append "Analysis tools: Ghidra 12.1.4 and PE-bear for header inspection; objdump for cross-checking addresses." to technicalContext once confirmed (spec §3b / §14.3).
technicalContext: "EndeavourOS Linux, MinGW-w64 GCC 16.2.0, Oracle VirtualBox, Windows FLARE-VM, Ghidra 12.1.4, Java 25."
limitations: "This article covers one build produced with the recorded toolchain. The analysis is static, plus one observed run. The `puts` call is traced from the call site to the import-table entry. The C runtime’s implementation of `puts` and the Windows output path were not examined. Which branch of `__gcc_register_frame` runs, and whether `libgcc_s_dw2-1.dll` is loaded, were not tested, because no debugger or runtime tracing was used. Branches of `__tmainCRTStartup` other than the path to `main` and `exit` were not examined. A rebuild may differ in bytes and layout, so recompute addresses from your own binary."
# TODO(author): confirm each reference supports its annotation, and add the MinGW-w64 runtime source for `__main` and constructor processing only after reading it (spec §13 / §14.5).
references:
  - title: "PE Format — Microsoft Learn"
    url: "https://learn.microsoft.com/en-us/windows/win32/debug/pe-format"
    annotation: "The specification for executable file structure referenced when discussing PE metadata and sections."
  - title: "Windows API sets — Microsoft Learn"
    url: "https://learn.microsoft.com/en-us/windows/win32/apiindex/windows-apisets"
    annotation: "Describes the API-set contract mechanism behind names such as API-MS-WIN-CRT-STDIO-L1-1-0."
  - title: "x64 calling convention — Microsoft Learn"
    url: "https://learn.microsoft.com/en-us/cpp/build/x64-calling-convention"
    annotation: "Defines the register and shadow-space rules discussed while reading the assembly."
  - title: "Get-FileHash — Microsoft Learn"
    url: "https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.utility/get-filehash"
    annotation: "Documentation for the PowerShell command used to verify file identity between the Linux host and the Windows guest."
  - title: "Initialization — GCC"
    url: "https://gcc.gnu.org/onlinedocs/gccint/Initialization.html"
    annotation: "Source of the note that `__main` is runtime support associated with initialization on applicable targets."
  - title: "Ghidra — official project repository"
    url: "https://github.com/NationalSecurityAgency/ghidra"
    annotation: "The reverse-engineering tool used for the listing, decompiler and imports views."
  - title: "MinGW-w64 — official project website"
    url: "https://www.mingw-w64.org/"
    annotation: "The toolchain providing the x86_64-w64-mingw32 cross-compiler used to build hello.exe."
---

A Windows executable is more than a collection of machine instructions. It has a defined file structure, dependencies on libraries, metadata used by the operating system, and code that participates in initializing and running a program.

Understanding these components is fundamental to reverse engineering. Whether the objective is to investigate an unfamiliar application, understand a program's behavior, or analyse a suspicious binary, the starting point is the same: establish what the file contains and distinguish that evidence from assumptions about what it does.

This guide to Windows executable analysis is part of the [Reverse Engineering](/topics/reverse-engineering/) and [Systems & Tooling](/topics/systems-tooling/) fieldnotes. It examines a small Windows executable built from C source code. Using MinGW-w64, a Windows virtual machine, and Ghidra, I compare the original source with the compiled file, inspect its machine instructions, and examine its imported functions.

The goal is not to reverse engineer a complex application. It is to establish a reliable foundation for examining Windows binaries. By the end, you should be able to identify the PE32+ header and section table, trace the entry point into `mainCRTStartup` and `main`, and follow an imported call such as `puts` to the import table.

The scope is deliberate. This article traces one executable from its PE header to the call that prints its message: the entry point, the runtime startup code, `main`, the string in `.rdata`, and the `puts` call as far as the import table. It does not analyze the C runtime’s implementation of `puts` or the Windows console-output path. Each claim is labelled Verified, Observed, Inferred or Not examined, so you can see what the evidence supports.

## 1. The test program and analysis environment

The experiment uses a deliberately small C program:

```c
#include <stdio.h>

int main(void)
{
    puts("Hello from my first Windows reverse-engineering experiment.");
    return 0;
}
```

The program has two essential operations: print a message and return a value indicating successful completion.

Because the source is available, it provides a useful reference when examining the compiled executable. The original declaration, string, and function call can be compared with the instructions and reconstructed code displayed by a disassembler and decompiler.

The environment used for this experiment was:

| Component             | Environment                          |
| --------------------- | ------------------------------------ |
| Host operating system | EndeavourOS Linux                    |
| Compiler              | MinGW-w64 cross-compiler, GCC 16.2.0 |
| Virtualization        | Oracle VirtualBox                    |
| Windows guest         | FLARE-VM                             |
| Static-analysis tool  | Ghidra 12.1.4                        |
| Java version          | 25                                   |

The executable was built on Linux and executed inside the Windows guest. Ghidra was used to inspect the same binary.

## 2. Compiling a Windows executable with MinGW-w64

The compiler command was:

```sh
x86_64-w64-mingw32-gcc \
  -Wall -Wextra -O0 \
  hello.c -o hello.exe
```

The options have the following purposes:

- `-Wall -Wextra` enable additional compiler warnings.
- `-O0` disables optimization.
- `-o hello.exe` specifies the output filename.

The `x86_64-w64-mingw32-gcc` executable is a cross-compiler targeting 64-bit Windows. Running it on Linux does not produce a Linux executable with a different filename; it produces a binary for the specified Windows target.

Compilation involves more than translating each C statement into an individual machine instruction. The toolchain processes the source, generates code, and links the necessary code and runtime dependencies into the output.

Consequently, the final executable can contain functions and instructions that were not explicitly written in the source file.

This distinction becomes important when examining compiler-generated startup and runtime support.

### Identifying the PE32+ executable format

After compilation, I ran:

```sh
file hello.exe
```

The output was:

```text
hello.exe: PE32+ executable for MS Windows 5.02 (console), x86-64, 19 sections
```

This output identifies several properties of the file.

**PE32+** refers to the 64-bit form of the Windows Portable Executable format. The PE format describes how executable images and related files are structured.

**Console** identifies the executable's subsystem classification.

**x86-64** identifies the target processor architecture.

**19 sections** is the section count reported by `file` for this particular binary.

The reported `5.02` is not the Windows version installed in the virtual machine. It relates to the subsystem version recorded in the PE Optional Header.

The section count also illustrates why source-code size is not a reliable indication of executable complexity. Even a small program can contain sections for code, data, imports, runtime support, and other information. Of the 19 sections in this build, 9 are DWARF debug sections (`.debug_*`). The remaining 10 hold code, data, imports, exception-handling data, thread-local storage and relocations. The precise contents come from the section table, not from the count.

<figure>
  <a href="/images/understanding-windows-executables/pe32-file-layout.png">
    <img
      src="/images/understanding-windows-executables/pe32-file-layout.webp"
      width="1536"
      height="1024"
      decoding="async"
      alt="Diagram of the PE32+ file layout: a DOS header whose e_magic and e_lfanew fields point to the PE signature, followed by the COFF file header, the 240-byte optional header, the section table, and sections such as .text, .rdata and .data with their file offsets."
      loading="lazy"
    />
  </a>
  <figcaption>
    The PE format organizes executable metadata and section information into a
    defined file structure.
  </figcaption>
</figure>

## 3. Verifying the Windows executable in a VM

After compiling the file, I transferred `hello.c`, `hello.exe`, and `SHA256SUMS` from the Linux host to the Windows FLARE-VM guest using a mounted ISO image.

In PowerShell, I ran:

```powershell
cd C:\Lab\Article01

.\hello.exe
$LASTEXITCODE

Get-FileHash .\hello.exe -Algorithm SHA256
```

The executable printed:

```text
Hello from my first Windows reverse-engineering experiment.
```

PowerShell reported an exit code of:

```text
0
```

The Windows SHA-256 hash was:

```text
A1DEA16451A5862D4028BBB533173191D5DE2065C58F94637DB2EEC526227502
```

On the Linux host, I calculated the hash using:

```sh
sha256sum hello.exe
```

The output was:

```text
a1dea16451a5862d4028bbb533173191d5de2065c58f94637db2eec526227502  hello.exe
```

The two hashes match exactly. Uppercase and lowercase hexadecimal characters represent the same values.

<figure>
  <a href="/images/understanding-windows-executables/powershell-runtime-verification.png">
    <img
      src="/images/understanding-windows-executables/powershell-runtime-verification.webp"
      width="717"
      height="207"
      decoding="async"
      alt="PowerShell session in the FLARE-VM guest: running .\hello.exe prints 'Hello from my first Windows reverse-engineering experiment.', $LASTEXITCODE reports 0, and Get-FileHash reports the SHA-256 digest A1DEA16451A5862D4028BBB533173191D5DE2065C58F94637DB2EEC526227502."
      loading="lazy"
    />
  </a>
  <figcaption>
    The executable produced the expected output in FLARE-VM, and its SHA-256
    hash matched the Linux copy.
  </figcaption>
</figure>

This confirms that the executable on the Windows guest is byte-identical to the copy hashed on the Linux host. The runtime output and exit code also establish that the program executed successfully in the tested environment.

Hash verification is useful when transferring samples between analysis systems. However, a matching hash does not establish that a program is safe or trustworthy. It establishes file identity between the copies being compared.

## 4. Examining the PE executable in Ghidra

With the executable verified and running, the next step was to examine its compiled representation.

I imported `hello.exe` into Ghidra 12.1.4 and examined the function identified as `main`.

The Decompiler pane displayed:

```c
int __cdecl main(int _Argc, char **_Argv, char **_Env)
{
    __main();
    puts("Hello from my first Windows reverse-engineering experiment.");
    return 0;
}
```

<figure>
  <a href="/images/understanding-windows-executables/ghidra-main-listing-decompiler.png">
    <img
      src="/images/understanding-windows-executables/ghidra-main-listing-decompiler.webp"
      width="1920"
      height="814"
      decoding="async"
      alt="Ghidra's main window for hello.exe: the Symbol Tree lists imports and functions including main, mainCRTStartup and puts; the Listing view shows main's instructions at address 140001580 with CALL __main and LEA RAX,[.rdata]; the Decompile view begins reconstructing int __cdecl main(int _Argc, char **_Argv, char **_Env)."
      loading="lazy"
    />
  </a>
  <figcaption>
    Ghidra's Listing and Decompile views for main: the call to <code>__main</code>
    appears both in the assembly and in the reconstructed code.
  </figcaption>
</figure>

The reconstructed code contains the expected message, the call to `puts`, and the return value. It also contains a call to `__main`, which was not explicitly present in the original C source.

This is an important distinction between source code and a compiled binary. The executable contains code produced through the toolchain's compilation and linking process, not merely a textual translation of the statements written by the programmer.

GCC documents `__main` as runtime support associated with initialization, including global constructors on applicable targets. This binary’s `__main` is examined in Section 7.

### Why the Ghidra signature differs from the C source

The original source declares:

```c
int main(void)
```

Ghidra displays:

```c
int __cdecl main(int _Argc, char **_Argv, char **_Env)
```

A decompiler reconstructs a C-like representation from machine instructions, symbols, and analysis results. Its inferred signature is not guaranteed to match the original source declaration exactly.

The displayed parameters should therefore be treated as Ghidra's reconstruction rather than proof that the original function was declared with those parameters.

The `__cdecl` label also needs context. On 64-bit Windows, ordinary function calls follow the Microsoft x64 calling convention. The presence of this label in a reconstructed prototype does not imply that the executable uses the distinct 32-bit x86 calling convention.

A decompiler is valuable for interpreting machine code, but its output remains an interpretation that should be checked against the underlying instructions.

The startup code does pass three values to `main`. At the machine-code level it loads `argc`, `argv` and `envp` into `ECX`, `RDX` and `R8` before the call (Section 6). That explains why Ghidra reconstructs a three-parameter prototype. It does not change the source, which declares `int main(void)`. The reconstructed signature is an interpretation of the call site, not a recovered declaration.

## 5. Reading the x86-64 assembly

The Ghidra Listing view showed the following instructions around `main`:

```asm
140001580  PUSH RBP
140001581  MOV  RBP, RSP
140001584  SUB  RSP, 0x20
140001588  CALL __main
14000158D  LEA  RAX, [0x140004050]   ; address of the string in .rdata
140001594  MOV  RCX, RAX
140001597  CALL puts
14000159C  MOV  EAX, 0x0
1400015A1  ADD  RSP, 0x20
1400015A5  POP  RBP
1400015A6  RET
```

Ghidra labels the `MOV` at `0x140001594` with the parameter alias `_Argc` in some views, because `RCX` is the first-argument register. The instruction is `MOV RCX, RAX`. Show the register, not the alias.

These instructions provide a lower-level view of the function reconstructed by the decompiler.

### x86-64 stack setup and alignment

The first three instructions are:

```asm
PUSH RBP
MOV  RBP, RSP
SUB  RSP, 0x20
```

`RBP` and `RSP` are registers used in stack management. The instructions save the previous frame pointer, establish a frame pointer, and reserve stack space.

The immediate value `0x20` represents 32 bytes.

The Microsoft x64 ABI requires the stack pointer to be 16-byte aligned at a call and a caller to reserve 32 bytes of shadow space for the callee. The check below follows the path from the entry point to `main`. It assumes the standard condition that `RSP ≡ 8 (mod 16)` on entry to `mainCRTStartup`, which is what the ABI expects after the caller’s `call`. That assumption was not examined.

| Point                     | Operation                    | RSP mod 16                         |
| ------------------------- | ---------------------------- | ---------------------------------- |
| `mainCRTStartup` entry    | assumed                      | 8                                  |
| after `SUB RSP, 0x28`     | 40 bytes                     | 0                                  |
| `__tmainCRTStartup` entry | `CALL` pushes return address | 8                                  |
| `__tmainCRTStartup`       | 8 register pushes (64 bytes) | 8                                  |
|                           | `SUB RSP, 0x58` (88 bytes)   | 0                                  |
| `main` entry              | `CALL` pushes return address | 8                                  |
| `main`                    | `PUSH RBP`                   | 0                                  |
|                           | `SUB RSP, 0x20`              | 0 at `CALL __main` and `CALL puts` |

Given the entry assumption, the frame sizes along this path are consistent with the ABI, including at `main`’s two call sites. Other call sites inside `__tmainCRTStartup` were not checked. This is not a claim about every call in the executable. The 32 bytes in `main` is not evidence of 32 bytes of local variables. It serves the shadow-space and alignment requirements.

Status: **Verified** for the arithmetic along this path, **Inferred** for the entry assumption.

### Passing the string to `puts` through the import table

The next sequence is:

```asm
LEA RAX, [0x140004050]
MOV RCX, RAX
CALL puts
```

The `LEA` instruction calculates an address associated with the string data. The following `MOV` places that address in `RCX`, after which the program calls `puts`.

Under the Microsoft x64 calling convention, `RCX` carries the first integer or pointer argument for an ordinary function call.

This sequence is consistent with the source-level call:

```c
puts("Hello from my first Windows reverse-engineering experiment.");
```

The string is represented in the executable's data, its address is obtained, and that address is passed as the first argument to `puts`.

The relationship between source code and assembly is not necessarily one statement to one instruction. Instead, the compiler produces instructions that implement the required behavior within the constraints of the target architecture and calling convention.

### Returning from `main`

The final sequence is:

```asm
MOV EAX, 0x0
ADD RSP, 0x20
POP RBP
RET
```

The value zero placed in `EAX` is consistent with the return value of `main`.

The function then restores the stack pointer and saved frame pointer before executing `RET`.

Returning from `main` is not the same operation as directly terminating a Windows process. The return value is passed back to the caller; runtime startup and termination code determine what happens afterward.

## 6. The PE entry point and Windows runtime startup

> A conventional C executable does not begin at `main`. The PE Optional Header’s `AddressOfEntryPoint` field gives an RVA, a location relative to the image base. The virtual address is the image base plus that RVA.

### 6.1 Resolving the PE entry point

| Field                       | Value                                | Where                                     |
| --------------------------- | ------------------------------------ | ----------------------------------------- |
| `ImageBase`                 | `0x140000000`                        | PE Optional Header                        |
| `AddressOfEntryPoint` (RVA) | `0x1440`                             | PE Optional Header                        |
| Entry-point VA              | `0x140000000 + 0x1440 = 0x140001440` | calculated                                |
| Function at `0x140001440`   | `mainCRTStartup`                     | Ghidra and the binary’s COFF symbol table |

Status: **Verified.** The header values were read in PE-bear and directly from the file bytes. The address maps to the symbol `mainCRTStartup`.

<!-- TODO(author): include the PE-bear Optional Header screenshot here (spec §6.1 / §14.2). -->

### 6.2 `mainCRTStartup` to `main`

`mainCRTStartup` is short:

```asm
140001440  SUB  RSP, 0x28
140001444  MOV  RAX, [__mingw_app_type]
14000144B  MOV  dword ptr [RAX], 0x0
140001451  CALL __tmainCRTStartup
```

It reserves stack space, stores `0` in `__mingw_app_type` (the console-application setting) and calls `__tmainCRTStartup` at `0x140001020`. A sibling, `WinMainCRTStartup` at `0x140001420`, is the GUI-application variant and is not referenced by this executable’s entry point.

`__tmainCRTStartup` does the runtime setup and then calls `main` at `0x1400010D4`. Before that call it loads `argc`, `argv` and `envp` into `ECX`, `RDX` and `R8`. After `main` returns, the console path runs `MOV ECX, EAX` then `CALL exit` at `0x140001407`, so `main`’s return value becomes the argument to `exit`.

Status: the call chain, the argument loads and the `exit` call are **Verified** by disassembly. Returning from `main` therefore reaches `exit`, not a direct process termination. `__tmainCRTStartup`’s other branches (lock handling, TLS callbacks, error exits) were **Not examined**.

### 6.3 Execution path from entry point to `main`

The static call relationships in this binary are:

```text
PE header: AddressOfEntryPoint 0x1440 + ImageBase 0x140000000
   |
   v
0x140001440  mainCRTStartup           sets __mingw_app_type = 0
   | call
   v
0x140001020  __tmainCRTStartup        loads argc/argv/envp
   | call at 0x1400010D4
   v
0x140001580  main
   |-- call at 0x140001588 --> 0x140001680  __main
   |                             '-- jmp --> 0x140001600  __do_global_ctors
   |                                           '-- call --> 0x140002B30  register_frame_ctor
   |                                                         '-- jmp --> 0x140001490  __gcc_register_frame
   '-- call at 0x140001597 --> 0x1400029D8  puts (thunk)
                                 '-- jmp [0x140009408] --> __imp_puts
   |
   | returns EAX = 0
   v
0x140001407  MOV ECX, EAX ; CALL exit   (inside __tmainCRTStartup)
```

Static call relationships traced in this binary. Execution beyond `__imp_puts` and beyond `exit` is outside what was examined.

## 7. What `__main` does in a MinGW-w64 build

GCC documents `__main` as initialization support associated with global constructors on applicable targets. That describes the symbol’s purpose in general. This section records what this binary’s copy does.

1. **`__main`** (`0x140001680`) reads an `initialized` flag. If it is already set, it returns. Otherwise it sets the flag and tail-jumps to `__do_global_ctors`.
2. **`__do_global_ctors`** (`0x140001600`) walks `__CTOR_LIST__` and calls each entry, then registers `__do_global_dtors` with `atexit`.
3. **The constructor list** (`0x1400049D0`, in `.rdata`) contains exactly one entry: `register_frame_ctor` at `0x140002B30`.
4. **`register_frame_ctor`** is a one-instruction thunk that jumps to `__gcc_register_frame` (`0x140001490`).
5. **`__gcc_register_frame`**:
   - calls `GetModuleHandleA("libgcc_s_dw2-1.dll")`;
   - if the module is already loaded, calls `LoadLibraryA`, then `GetProcAddress` for `__register_frame_info` and `__deregister_frame_info`;
   - if it is not loaded, falls back to weak stubs;
   - in both cases calls the register function on the frame data at `0x140005000` when one is available, and registers `__gcc_deregister_frame` with `atexit`.

> **Runtime-supplied versus source-requested.** The one constructor in this list comes from the toolchain’s startup objects. Nothing in the list is attributable to `hello.c`, which contains no constructors of its own. The binary shows a runtime that carries initialization machinery regardless of what the source asks for. Whether other MinGW-w64 builds contain the same entry depends on the runtime version and link configuration.

| Claim                                                                        | Status                                  |
| ---------------------------------------------------------------------------- | --------------------------------------- |
| `__main` checks a flag and tail-calls `__do_global_ctors`                    | Verified                                |
| `__CTOR_LIST__` has one entry, `register_frame_ctor`                         | Verified (raw bytes and disassembly)    |
| `register_frame_ctor` leads to `__gcc_register_frame`                        | Verified                                |
| The code is exception-frame registration support                             | Inferred from the strings and API calls |
| Which branch ran, whether the DLL was loaded, whether registration succeeded | Not examined (no dynamic analysis)      |

The import table does not list `libgcc_s_dw2-1.dll`. That is consistent with the fallback path, but it is not evidence of which branch executed.

<!-- TODO(author): include the Ghidra screenshots for `__main`, `__do_global_ctors` and `__gcc_register_frame` here (spec §7 / §14.1). -->

## 8. Windows imports and the `puts` call

Ghidra’s Imports tree showed API-set contracts, including:

```text
API-MS-WIN-CRT-STDIO-L1-1-0
```

Expanding this entry revealed symbols including:

```text
__acrt_iob_func
__p__commode
__p__fmode
__stdio_common_vfprintf
fflush
puts
setvbuf
```

These are names displayed in the executable’s import information under the CRT standard-I/O API-set contract.

<figure>
  <a href="/images/understanding-windows-executables/ghidra-imports-stdio.png">
    <img
      src="/images/understanding-windows-executables/ghidra-imports-stdio.webp"
      width="390"
      height="476"
      decoding="async"
      alt="Ghidra's Imports tree: under the API-MS-WIN-CRT-STDIO-L1-1-0.DLL contract it lists __acrt_iob_func, __p__commode, __p__fmode, __stdio_common_vfprintf, fflush, puts and setvbuf, alongside other CRT API-set contracts and KERNEL32.DLL."
      loading="lazy"
    />
  </a>
  <figcaption>
    Ghidra’s Imports tree exposes the executable’s imported standard-I/O
    functions.
  </figcaption>
</figure>

The `puts` import is particularly relevant because the Listing view also contains a call to `puts` inside `main`.

Three observations can therefore be compared:

- The Imports tree lists `puts` as an imported function.
- The disassembly shows a call to `puts`.
- PowerShell displayed the expected message when the executable ran.

The API-set name is also significant. An API-set contract is not necessarily the name of a physical DLL implementing the imported function. Windows uses its API-set mechanism to resolve these contracts.

The displayed imports suggest a relationship with the Universal C Runtime’s standard-I/O functionality. Determining the exact runtime configuration and implementation path for this particular build requires further inspection.

### Following `puts` to the import address table

The call in `main` is traced through the actual addresses:

| Step        | Address       | What is there                                                          |
| ----------- | ------------- | ---------------------------------------------------------------------- |
| Call site   | `0x140001597` | `CALL 0x1400029D8`                                                     |
| Local thunk | `0x1400029D8` | `JMP [0x140009408]`                                                    |
| IAT slot    | `0x140009408` | `__imp_puts`; on disk holds RVA `0x9700` (a hint/name entry); hint 133 |
| Import      |               | `puts` under `api-ms-win-crt-stdio-l1-1-0.dll`                         |
| Argument    | `0x140004050` | string in `.rdata`, in `RCX` at the call                               |

The thunk contains no implementation of `puts`. It jumps through a pointer that the Windows loader fills in at load time. The bytes in the IAT slot on disk (`00 97 00 00 …`) are an RVA to a hint/name entry, not the function’s runtime address.

Status: **Verified** from the call site to the import-table entry. Everything after the loader resolves that slot is **Not examined**: the Universal C Runtime’s `puts`, buffering and the Windows console-output path.

More generally, imports help identify dependencies and interfaces used by a binary. They do not, by themselves, establish which functions execute during a particular run or explain the complete behavior of the program.

## 9. What this Windows executable analysis establishes

The experiment provides several independently observed facts about the same executable.

| Question                                                             | Evidence                                                                                      | Status                                       |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | -------------------------------------------- |
| What format does `file` identify?                                    | `file hello.exe` output                                                                       | Observed                                     |
| Are the host and guest copies identical?                             | Matching SHA-256 hashes; hash also recomputed from the analyzed file                          | Verified                                     |
| Did the executable print the expected message and exit with 0?       | PowerShell output and `$LASTEXITCODE`                                                         | Observed                                     |
| What does Ghidra reconstruct for `main`?                             | Decompiler view                                                                               | Observed                                     |
| Is `__main` called inside `main`?                                    | Listing and decompiler                                                                        | Observed                                     |
| Does the entry point resolve to `mainCRTStartup`?                    | `0x140000000 + 0x1440 = 0x140001440`, matching the symbol                                     | Verified                                     |
| What does this binary’s `__main` do?                                 | Disassembly of `__main`, `__do_global_ctors`, the constructor list and `__gcc_register_frame` | Verified                                     |
| Does startup pass `argc`, `argv`, `envp` to `main`?                  | Register loads before the call at `0x1400010D4`                                               | Verified                                     |
| Does `main`’s return value reach `exit`?                             | `MOV ECX, EAX; CALL exit` at `0x140001407`                                                    | Verified                                     |
| How does the `puts` call reach the import?                           | Call site, thunk and IAT slot, as in Section 8                                                | Verified                                     |
| Does the assembly place the string address in `RCX` before the call? | Listing                                                                                       | Observed                                     |
| Is stack alignment consistent to `main`?                             | Arithmetic in Section 5, assuming standard entry alignment                                    | Verified, with the entry assumption Inferred |
| Did the runtime load `libgcc_s_dw2-1.dll`?                           | No dynamic analysis                                                                           | Not examined                                 |
| What is the execution path inside `puts`?                            | No trace collected                                                                            | Not examined                                 |

The distinction between observed facts and unresolved questions is important in reverse engineering. A function name, import entry, or decompiler reconstruction can provide useful evidence, but each supports a different kind of conclusion.

A reliable analysis records what the evidence shows and avoids turning plausible explanations into verified findings.

## 10. Reproducing the Windows executable analysis

The core experiment can be reproduced with a Windows-targeted MinGW-w64 compiler, a Windows test environment, and Ghidra.

First, save the source as `hello.c` and compile it:

```sh
x86_64-w64-mingw32-gcc \
  -Wall -Wextra -O0 \
  hello.c -o hello.exe
```

Identify the file and calculate its hash:

```sh
file hello.exe
sha256sum hello.exe
```

Transfer the executable to a Windows virtual machine. Compare the SHA-256 hashes, run the program, and record its exit code:

```powershell
.\hello.exe
$LASTEXITCODE

Get-FileHash .\hello.exe -Algorithm SHA256
```

Finally, import the same executable into Ghidra and inspect:

1. The reconstructed `main` function.
2. The Listing view around `main`.
3. The instructions that prepare the argument to `puts`.
4. The Imports tree and its CRT standard-I/O entry.
5. The PE Optional Header (`ImageBase`, `AddressOfEntryPoint`) in PE-bear or Ghidra’s PE view, and the function at the resulting address.
6. The constructor list behind `__main`.
7. The call chain from `main`’s `CALL puts` to the IAT slot.

The experiment used a mounted ISO for file transfer, but another controlled transfer method can be used.

A rebuild may produce a different binary because compiler configuration, runtime linkage, and build details can affect the output. Record the environment and observed results rather than expecting another build to have the same hash or identical layout. A rebuild may not match these addresses; recompute them from your own binary using the VA = ImageBase + RVA relationship.

## Conclusion: from PE structure to runtime behavior

Examining one small Windows executable connects several ideas that run through reverse engineering. The PE header’s entry point leads to the compiler’s startup code, not to `main`. That startup code prepares the runtime, passes `argc`, `argv` and `envp` to `main`, and sends `main`’s return value to `exit`. Inside `main`, a call to `__main` runs toolchain-supplied initialization that the source never requested. The greeting is a string in `.rdata`, and the `puts` call reaches the import table through a local thunk.

The source, the disassembly, the decompiler’s output, the PE metadata and the run each answer different questions. The useful habit is to move between them without treating them as equivalent, and to label each claim by how it was established.

These fundamentals lead to the next questions: how the loader resolves imports, what the C runtime does inside `puts`, and what a debugger shows when the same path runs.
