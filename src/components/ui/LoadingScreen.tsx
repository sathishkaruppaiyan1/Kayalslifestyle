import React from "react";

const LoadingScreen = () => {
    return (
        <div className="fixed inset-0 bg-background z-[100] flex flex-col items-center justify-center gap-4 animate-fade-in">
            <div className="w-24 h-24 md:w-32 md:h-32 relative animate-pulse">
                <img
                    src="/logo-kayals.jpg"
                    alt="Loading..."
                    className="w-full h-full object-contain"
                />
            </div>
            <p className="text-foreground font-medium text-lg animate-pulse">
                Loading, please wait...
            </p>
        </div>
    );
};

export default LoadingScreen;
