# ubuild

ubuild 管理 Unreal Engine 项目的构建、运行和分发工作流。

## Language

**Project Run**:
由 ubuild 为一个已解析的 Unreal 项目启动并管理的活动编辑器运行实例。同一项目同一时间至多有一个 Project Run；新的 Project Run 会强制终止并替换旧实例，不保留旧实例中未保存的编辑器状态。
_Avoid_: Editor process, run command

**Project Identity**:
由 `.uproject` 文件的规范位置确定的项目身份。指向同一文件的不同路径写法属于同一项目，不同位置的项目副本拥有不同身份。
_Avoid_: Project name

**Project Workspace**:
一个或多个 Project Identity 共同使用构建产物和运行状态的规范目录。同一目录中的多个 `.uproject` 属于同一个 Project Workspace，必须参与同一组项目操作竞争。
_Avoid_: Project directory, lock scope

**Project Operation**:
会改变 Project Workspace 状态或为其中的项目启动受管工具的 ubuild 调用。整台机器上，一个 Project Workspace 同时至多由一个 Project Operation 占有。Windows 上新的 Project Operation 会强制替换旧实例；其他平台当前只检测竞争，不执行强制替换。
_Avoid_: Project command

**Project Observation**:
只读取项目信息且不改变项目状态的 ubuild 调用。Project Observation 不占有项目，也不会替换正在执行的 Project Operation。
_Avoid_: Read-only operation
