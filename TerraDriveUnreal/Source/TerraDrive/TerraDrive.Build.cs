using UnrealBuildTool;
public class TerraDrive : ModuleRules {
    public TerraDrive(ReadOnlyTargetRules Target) : base(Target) {
        PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;
        PublicDependencyModuleNames.AddRange(new string[] {"Core","CoreUObject","Engine","InputCore","ProceduralMeshComponent","Json","JsonUtilities","PhysicsCore","Slate","SlateCore"});
    }
}
