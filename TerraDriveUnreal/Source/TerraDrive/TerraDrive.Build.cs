using UnrealBuildTool;
public class TerraDrive : ModuleRules {
    public TerraDrive(ReadOnlyTargetRules Target) : base(Target) {
        PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;
        // Independent implementation files intentionally have private helper
        // names. Keep builds independent of Git's adaptive-unity working set.
        bUseUnity = false;
        PublicDependencyModuleNames.AddRange(new string[] {"Core","CoreUObject","Engine","InputCore","ProceduralMeshComponent","Json","JsonUtilities","PhysicsCore","Slate","SlateCore"});
        // Collider telemetry reads installed Chaos mesh geometry in both the
        // monolithic game and the separately linked editor module.
        PrivateDependencyModuleNames.Add("Chaos");
    }
}
