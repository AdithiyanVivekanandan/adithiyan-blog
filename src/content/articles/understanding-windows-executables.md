---
title: "Understanding Windows Executables"
subtitle: "From compiled code and PE structure to runtime behavior"
slug: "understanding-windows-executables"
description: "An introduction to Windows executable analysis, examining compilation, PE metadata, runtime support, assembly, imports, and the relationship between source code and a compiled binary."
status: published
publishedAt: 2026-10-17T20:00:00Z
topics:
  - reverse-engineering
  - systems-tooling
articleType: tutorial
technicalContext: "EndeavourOS Linux, MinGW-w64 GCC 16.2.0, Oracle VirtualBox, Windows FLARE-VM, Ghidra 12.1.4, Java 25."
limitations: "Two questions listed in the experiment remain unresolved: whether the PE entry-point address resolves to `mainCRTStartup`, and what this binary's `__main` implementation does. The internal path behind `puts` was not examined, and every observation describes one build produced with the recorded toolchain — a rebuild may differ in bytes and layout."
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

This article examines a small Windows executable built from C source code. Using MinGW-w64, a Windows virtual machine, and Ghidra, I compare the original source with the compiled file, inspect its machine instructions, and examine its imported functions.

The goal is not to reverse engineer a complex application. It is to establish a reliable foundation for examining Windows binaries.

## 1. The program and its environment

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

## 2. Compiling a Windows executable

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

### Identifying the executable format

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

The section count also illustrates why source-code size is not a reliable indication of executable complexity. Even a small program can contain sections for code, data, imports, runtime support, and other information. The precise contents should be determined by inspecting the section table, not inferred from the count alone.

<figure>
  <a href="/images/understanding-windows-executables/pe32-file-layout.png">
    <img
      src="/images/understanding-windows-executables/pe32-file-layout.png"
      width="1536"
      height="1024"
      alt="Diagram of the PE32+ file layout: a DOS header whose e_magic and e_lfanew fields point to the PE signature, followed by the COFF file header, the 240-byte optional header, the section table, and sections such as .text, .rdata and .data with their file offsets."
      loading="lazy"
    />
  </a>
  <figcaption>
    The PE format organizes executable metadata and section information into a
    defined file structure.
  </figcaption>
</figure>

## 3. Verifying the executable in Windows

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
      src="/images/understanding-windows-executables/powershell-runtime-verification.png"
      width="717"
      height="207"
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

## 4. Examining the executable in Ghidra

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
      src="/images/understanding-windows-executables/ghidra-main-listing-decompiler.png"
      width="1920"
      height="814"
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

GCC documents `__main` as runtime support associated with initialization, including global constructors on applicable targets. That provides context for the symbol, but identifying the exact behavior of this instance requires examining the function's implementation in the binary.

The decompiler output alone does not establish everything that `__main` does.

### Why does the reconstructed signature differ?

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

## 5. Reading the assembly

The Ghidra Listing view showed the following instructions around `main`:

```asm
140001580  PUSH RBP
140001581  MOV  RBP, RSP
140001584  SUB  RSP, 0x20
140001588  CALL __main
14000158D  LEA  RAX, [.rdata]
140001594  MOV  RCX, RAX
140001597  CALL puts
14000159C  MOV  EAX, 0x0
1400015A1  ADD  RSP, 0x20
1400015A5  POP  RBP
1400015A6  RET
```

These instructions provide a lower-level view of the function reconstructed by the decompiler.

### Stack setup and alignment

The first three instructions are:

```asm
PUSH RBP
MOV  RBP, RSP
SUB  RSP, 0x20
```

`RBP` and `RSP` are registers used in stack management. The instructions save the previous frame pointer, establish a frame pointer, and reserve stack space.

The immediate value `0x20` represents 32 bytes.

On the Microsoft x64 ABI, a caller reserves 32 bytes of shadow space for the callee. The `PUSH RBP` changes the stack pointer, and subtracting `0x20`, a multiple of 16, preserves the required alignment for subsequent calls under the usual function-entry conditions.

This allocation should not be interpreted as proof that the source contains 32 bytes of local variables. Stack space can serve calling-convention and alignment requirements.

### Passing the string to `puts`

The next sequence is:

```asm
LEA RAX, [...]
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

### Returning from the function

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

## 6. The executable entry point and runtime startup

The C function `main` is not ordinarily the initial entry point of a conventional Windows C executable.

The PE Optional Header contains an `AddressOfEntryPoint` field. This field identifies the entry-point address relative to the loaded image.

For a conventional C executable, startup code prepares the runtime environment before transferring control to `main`. This is one reason a compiled binary can contain functions that are absent from the original source.

Ghidra's Symbol Tree showed a symbol named `mainCRTStartup` in this executable. Its presence is consistent with a runtime startup routine. However, the symbol's presence alone does not establish that it corresponds to this binary's PE entry-point address.

To confirm that relationship, the entry-point field must be inspected in the PE header and compared with the corresponding address in Ghidra.

Conceptually, the execution path of a conventional C executable can be represented as:

```text
Windows executable on disk
          |
          v
Process creation and image loading
          |
          v
PE entry point
          |
          v
C runtime startup
          |
          v
main()
          |
          v
puts(message)
          |
          v
Return from main and runtime termination
```

This is a simplified model rather than a trace of every operation performed by the Windows loader in this experiment.

The loader, runtime initialization, application code, and termination routines have distinct responsibilities. Understanding those boundaries helps when moving from simple executable inspection to more detailed Windows internals analysis.

## 7. Understanding imported functions

Ghidra's Imports tree showed API-set contracts, including:

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

These are names displayed in the executable's import information under the CRT standard-I/O API-set contract.

<figure>
  <a href="/images/understanding-windows-executables/ghidra-imports-stdio.png">
    <img
      src="/images/understanding-windows-executables/ghidra-imports-stdio.png"
      width="390"
      height="476"
      alt="Ghidra's Imports tree: under the API-MS-WIN-CRT-STDIO-L1-1-0.DLL contract it lists __acrt_iob_func, __p__commode, __p__fmode, __stdio_common_vfprintf, fflush, puts and setvbuf, alongside other CRT API-set contracts and KERNEL32.DLL."
      loading="lazy"
    />
  </a>
  <figcaption>
    Ghidra's Imports tree exposes the executable's imported standard-I/O
    functions.
  </figcaption>
</figure>

The `puts` import is particularly relevant because the Listing view also contains a call to `puts` inside `main`.

Three observations can therefore be compared:

- The Imports tree lists `puts` as an imported function.
- The disassembly shows a call to `puts`.
- PowerShell displayed the expected message when the executable ran.

These observations are consistent with one another, but they do not constitute a complete trace of the internal implementation of `puts` or every operation involved in producing the output.

The API-set name is also significant. An API-set contract is not necessarily the name of a physical DLL implementing the imported function. Windows uses its API-set mechanism to resolve these contracts.

The displayed imports suggest a relationship with the Universal C Runtime's standard-I/O functionality. Determining the exact runtime configuration and implementation path for this particular build requires further inspection.

More generally, imports help identify dependencies and interfaces used by a binary. They do not, by themselves, establish which functions execute during a particular run or explain the complete behavior of the program.

## 8. What the experiment establishes

The experiment provides several independently observed facts about the same executable.

| Question                                                           | Evidence                              | Status           |
| ------------------------------------------------------------------ | ------------------------------------- | ---------------- |
| What format does the file utility identify?                        | `file hello.exe` output               | Observed         |
| Are the host and guest copies identical?                           | Matching SHA-256 hashes               | Verified         |
| Did the executable print the expected message?                     | PowerShell output                     | Observed         |
| What does Ghidra reconstruct for `main`?                           | Decompiler view                       | Observed         |
| Is `__main` called inside `main`?                                  | Decompiler and Listing views          | Observed         |
| Is `puts` listed as an import?                                     | Imports tree                          | Observed         |
| Does the assembly place an address in `RCX` before calling `puts`? | Listing instructions                  | Observed         |
| Does the PE entry-point address resolve to `mainCRTStartup`?       | Header-to-function address comparison | Not yet verified |
| What does this binary's `__main` implementation do?                | Inspection of the function body       | Not yet verified |
| What is the complete internal execution path behind `puts`?        | No execution trace collected          | Not examined     |

The distinction between observed facts and unresolved questions is important in reverse engineering. A function name, import entry, or decompiler reconstruction can provide useful evidence, but each supports a different kind of conclusion.

A reliable analysis records what the evidence shows and avoids turning plausible explanations into verified findings.

## 9. Reproducing the experiment

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
5. The PE Optional Header and entry-point address.

The experiment used a mounted ISO for file transfer, but another controlled transfer method can be used.

A rebuild may produce a different binary because compiler configuration, runtime linkage, and build details can affect the output. Record the environment and observed results rather than expecting another build to have the same hash or identical layout.

## Conclusion

Examining a small Windows executable provides a practical introduction to several concepts that are central to reverse engineering.

The source code describes the program that was written. The compiled executable contains machine instructions and supporting structures produced by the toolchain. Ghidra reconstructs a readable representation of those instructions, while the Imports tree exposes information about external dependencies.

In this experiment, the original source, the disassembly, the imported `puts` symbol, and the runtime output provided complementary views of the same program. The additional `__main` call also demonstrated why the compiled binary cannot be understood solely by reading the original C source.

The important skill is learning to move between these representations without treating them as equivalent. Source code, machine instructions, file metadata, imports, and runtime observations answer different questions.

These fundamentals provide the starting point for deeper examination of the PE format, Windows process initialization, imported APIs, and the behavior of unfamiliar executables.
